import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  removeUnoPlayer,
  processUnoExpireTurn,
  processUnoPlay,
  processUnoPass,
  processUnoSwap,
  processUnoPlayMulti,
  processUnoDraw,
  processUnoChallenge,
  processUnoTeamLeaveDecision,
  processUnoCall,
  finishExpiredUnoGame,
  UNO_REMOVE_CONFLICT_ERROR,
} from './uno'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'
import {
  removeScrabblePlayer,
  processScrabblePass,
  processScrabbleExchange,
  processScrabbleExpireTurn,
  finishScrabbleGameEarly,
  finishExpiredScrabbleGame,
  SCRABBLE_REMOVE_CONFLICT_ERROR,
} from './scrabble'

/**
 * Concurrent leaves read the same session snapshot. A leave that writes the session without an
 * `updated_at` compare-and-swap lets the second writer drop the first removal (dead seat left in
 * turn_order) or clobber a concurrent turn. These tests run the real functions against a tiny
 * stateful in-memory Supabase stand-in whose `.eq('updated_at', ...)` filter really gates updates.
 */

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

/**
 * In-memory stand-in for the transactional finish functions (finish_uno_session / finish_scrabble_session). The
 * real ones are tested against the migrated schema in supabase/tests; this mirrors their contract (already
 * finished -> only the games flip; stale version -> lost; otherwise the whole payload at once) so the app's
 * mapping of the outcomes is exercised.
 */
function finishRpc(tables: Tables, name: string, args: Record<string, unknown>): unknown {
  if (name === 'claim_finish_bookkeeping') return { status: 'none' }
  if (name === 'apply_uno_move' || name === 'apply_scrabble_move') {
    // The non-finishing move: the session claim and the move's hand / state writes in one step.
    const isUno = name === 'apply_uno_move'
    const sess = tables[isUno ? 'uno_sessions' : 'scrabble_sessions'].find(
      (r) => r.game_id === String(args.p_game_id).toUpperCase()
    )
    if (!sess) return { status: 'invalid', reason: 'session_missing' }
    if (sess.phase === 'finished' || sess.updated_at !== args.p_expected_updated_at) return { status: 'lost' }
    Object.assign(sess, args.p_session_patch as Row)
    sess.updated_at = `${String(args.p_expected_updated_at)}+move`
    const rowsTable = isUno ? 'uno_player_hands' : 'scrabble_player_state'
    for (const w of (isUno ? args.p_hand_writes : args.p_state_writes) as Row[]) {
      const row = tables[rowsTable].find((r) => r.game_id === sess.game_id && r.player_id === w.player_id)
      if (row) Object.assign(row, { ...w, player_id: row.player_id })
    }
    for (const id of (args.p_spectator_ids as string[] | null | undefined) ?? []) {
      const player = tables.players.find((p) => p.id === id)
      if (player) player.spectator = true
    }
    return { status: 'applied' }
  }
  const uno = name === 'finish_uno_session'
  const sessions = uno ? 'uno_sessions' : 'scrabble_sessions'
  const rows = uno ? 'uno_player_hands' : 'scrabble_player_state'
  const gameId = String(args.p_game_id).toUpperCase()
  const game = tables.games.find((g) => g.id === gameId)
  const session = tables[sessions].find((r) => r.game_id === gameId)
  if (!game || !session) return { status: 'invalid', reason: 'missing', games_flipped: false }
  const flip = (onlyActive: boolean) => {
    if (game.status !== 'active' && (onlyActive || game.status !== 'waiting')) return false
    game.status = 'finished'
    return true
  }
  const round = args.p_round as { session_started_at?: unknown; sessions_played?: unknown } | null | undefined
  if (
    round &&
    (('sessions_played' in round && (game.sessions_played ?? null) !== round.sessions_played) ||
      ('session_started_at' in round && (game.session_started_at ?? null) !== round.session_started_at))
  ) {
    return { status: 'lost', reason: 'round', games_flipped: false }
  }
  const remove = () => {
    const id = (args.p_remove_player_id as string | null) ?? null
    if (!id) return
    tables.players = tables.players.filter((p) => p.id !== id)
    tables[rows] = tables[rows].filter((r) => r.player_id !== id)
  }
  if (session.phase === 'finished') {
    // Never removes anyone from a published result; only an ACTIVE game is flipped.
    return { status: 'already_finished', games_flipped: flip(true) }
  }
  if (session.updated_at !== args.p_expected_updated_at) return { status: 'lost', games_flipped: false }
  Object.assign(session, args.p_session_patch as Row, { phase: 'finished', turn_deadline_at: null })
  session.updated_at = `${String(args.p_expected_updated_at)}+finished`
  for (const w of (uno ? args.p_hand_writes : args.p_state_writes) as Row[]) {
    const row = tables[rows].find((r) => r.player_id === w.player_id)
    if (row) Object.assign(row, { ...w, player_id: row.player_id })
  }
  const series = args.p_series as { winner_id: string; points: number } | null | undefined
  if (uno && series && game.uno_series_scoring === true && !game.uno_series_winner_id) {
    const totals = { ...((game.uno_series_scores as Record<string, number> | undefined) ?? {}) }
    totals[series.winner_id] = (totals[series.winner_id] ?? 0) + series.points
    game.uno_series_scores = totals
  }
  for (const id of (args.p_spectator_ids as string[] | null | undefined) ?? []) {
    const player = tables.players.find((p) => p.id === id)
    if (player) player.spectator = true
  }
  remove()
  return { status: 'finished', games_flipped: flip(false) }
}

function makeDb(
  tables: Tables,
  hooks: {
    afterSessionRead?: (table: string) => void
    failUpdates?: (table: string) => boolean
    failSelect?: (table: string) => boolean
    failDeletes?: (table: string) => boolean
    failRpc?: (name: string) => boolean
  } = {}
) {
  function builder(table: string) {
    let op: 'select' | 'update' | 'delete' = 'select'
    let vals: Row = {}
    const filters: [string, unknown][] = []
    const notFilters: [string, unknown][] = []
    let selectAfter = false
    let single = false

    const exec = (): { data: unknown; error: { message: string } | null } => {
      const rows = (tables[table] ?? []).filter(
        (r) => filters.every(([k, v]) => r[k] === v) && notFilters.every(([k, v]) => r[k] !== v)
      )
      if (op === 'update') {
        if (hooks.failUpdates?.(table)) return { data: null, error: { message: 'boom' } }
        for (const r of rows) Object.assign(r, vals)
        return { data: selectAfter ? rows.map((r) => ({ ...r })) : null, error: null }
      }
      if (op === 'delete') {
        if (hooks.failDeletes?.(table)) return { data: null, error: { message: 'secret db detail' } }
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r))
        return { data: null, error: null }
      }
      if (hooks.failSelect?.(table)) return { data: null, error: { message: 'boom' } }
      const copy = rows.map((r) => ({ ...r }))
      hooks.afterSessionRead?.(table)
      return { data: single ? (copy[0] ?? null) : copy, error: null }
    }

    const b: Record<string, unknown> = {
      select: () => {
        if (op === 'update') selectAfter = true
        return b
      },
      update: (v: Row) => {
        op = 'update'
        vals = v
        return b
      },
      delete: () => {
        op = 'delete'
        return b
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return b
      },
      neq: (k: string, v: unknown) => {
        notFilters.push([k, v])
        return b
      },
      in: () => b,
      order: () => b,
      maybeSingle: () => {
        single = true
        return Promise.resolve(exec())
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }

  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string, args: Record<string, unknown>) =>
        Promise.resolve(
          hooks.failRpc?.(name)
            ? { data: null, error: { message: 'boom' } }
            : { data: finishRpc(tables, name, args), error: null }
        ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    tables,
  }
}

const T0 = '2026-01-01T00:00:00.000Z'
const names = ['A', 'B', 'C', 'D'].map((id) => ({ id, game_id: 'G', name: id }))

function unoTables(): Tables {
  return {
    games: [
      {
        id: 'G',
        timer_seconds: 0,
        uno_team_mode: false,
        status: 'active',
        session_started_at: '2020-01-01T00:00:00.000Z',
        sessions_played: 1,
      },
    ],
    players: names.map((p) => ({ ...p })),
    uno_player_hands: names.map((p, i) => ({
      game_id: 'G',
      player_id: p.id,
      player_order: i,
      cards: [{ id: `${p.id}1`, color: 'red', value: '5' }],
    })),
    uno_sessions: [
      {
        game_id: 'G',
        phase: 'playing',
        turn_order: ['A', 'B', 'C', 'D'],
        current_turn_index: 0,
        direction: 1,
        finish_order: [],
        eliminated_player_ids: [],
        uno_pending_player: null,
        top_card: { id: 't', color: 'red', value: '3' },
        updated_at: T0,
      },
    ],
  }
}

describe('removeUnoPlayer — concurrent leaves', () => {
  it('retries on a lost CAS so neither removal is dropped', async () => {
    const t = unoTables()
    let raced = false
    const db = makeDb(t, {
      // After the first leaver has read the session, a second leave commits first.
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        const s = t.uno_sessions[0]
        s.turn_order = ['A', 'C', 'D']
        s.updated_at = '2026-01-01T00:00:01.000Z'
        t.players = t.players.filter((p) => p.id !== 'B')
      },
    })
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].turn_order).toEqual(['A', 'D'])
    expect(t.players.map((p) => p.id)).toEqual(['A', 'D'])
  })

  it('does not delete the players row and reports a conflict when the session keeps changing', async () => {
    const t = unoTables()
    let n = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        t.uno_sessions[0].updated_at = `2026-01-01T00:00:${String(++n).padStart(2, '0')}.000Z`
      },
    })
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBe(UNO_REMOVE_CONFLICT_ERROR)
    expect(n).toBe(4)
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('C')
  })
})

describe('removeUnoPlayer — pending decisions', () => {
  // C's leave reads phase 'playing'; A then plays a Wild (phase -> choose_color) before the write lands.
  function raceToChooseColor(t: Tables) {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        const s = t.uno_sessions[0]
        s.phase = 'choose_color'
        s.status_message = 'A played a Wild — choose a colour'
        s.updated_at = '2026-01-01T00:00:01.000Z'
      },
    })
  }

  it("keeps another player's pending colour choice when someone else leaves", async () => {
    const t = unoTables()
    const db = raceToChooseColor(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].turn_order).toEqual(['A', 'B', 'D'])
    expect(t.uno_sessions[0].phase).toBe('choose_color')
    expect(t.uno_sessions[0].status_message).toBe('A played a Wild — choose a colour')
  })

  it('cancels the pending decision when the decision owner is the one who leaves', async () => {
    const t = unoTables()
    const db = raceToChooseColor(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'A', 'A')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].phase).toBe('playing')
    expect(t.uno_sessions[0].turn_order).toEqual(['B', 'C', 'D'])
  })
})

describe('removeUnoPlayer — pending decision keeps its deadline', () => {
  const DEADLINE = '2030-01-01T00:00:00.000Z'
  it("another player's leave does not restart the decision owner's timer", async () => {
    const t = unoTables()
    t.games[0].timer_seconds = 30
    Object.assign(t.uno_sessions[0], { phase: 'choose_color', turn_deadline_at: DEADLINE })
    const res = await removeUnoPlayer(makeDb(t).supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].phase).toBe('choose_color')
    expect(t.uno_sessions[0].turn_deadline_at).toBe(DEADLINE)
  })

  it("the decision owner's own leave starts the next player's timer", async () => {
    const t = unoTables()
    t.games[0].timer_seconds = 30
    Object.assign(t.uno_sessions[0], { phase: 'choose_color', turn_deadline_at: DEADLINE })
    const res = await removeUnoPlayer(makeDb(t).supabase, 'G', 'A', 'A')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].turn_deadline_at).not.toBe(DEADLINE)
    expect(t.uno_sessions[0].turn_deadline_at).toBeTruthy()
  })
})

describe('processUnoExpireTurn — concurrent expiry', () => {
  it('returns skipped (not an error) when another caller already handled the turn', async () => {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.turn_deadline_at = '2020-01-01T00:00:00.000Z'
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        // Read #1 is the expire handler's load; right after it, the winner auto-plays and advances.
        if (++reads !== 1) return
        s.current_turn_index = 1
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeUndefined()
    expect(res.skipped).toBe(true)
  })
})

describe('uno actions — a competing write (e.g. a leave) after the load', () => {
  // The leave commits between the action's read and its write: the action's CAS must lose and report
  // `skipped` (the routes answer 409) instead of reporting success for a write that never landed.
  const leaveAfterRead = (t: Tables) => {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        const s = t.uno_sessions[0]
        s.turn_order = ['A', 'B', 'D']
        s.updated_at = '2026-01-01T00:00:01.000Z'
      },
    })
  }

  it('processUnoPlay reports skipped and leaves the leaver-updated session untouched', async () => {
    const t = unoTables()
    const db = leaveAfterRead(t)
    const res = await processUnoPlay(db.supabase, 'G', 'A', 'A1')
    expect(res).toEqual({ skipped: true })
    expect(t.uno_sessions[0].turn_order).toEqual(['A', 'B', 'D'])
    expect(t.uno_sessions[0].current_turn_index).toBe(0)
  })

  it('processUnoPass reports skipped', async () => {
    const t = unoTables()
    t.uno_sessions[0].drawn_card_id = 'A1'
    const db = leaveAfterRead(t)
    const res = await processUnoPass(db.supabase, 'G', 'A')
    expect(res).toEqual({ skipped: true })
  })

  it('processUnoSwap reports skipped (not success) when the CAS loses', async () => {
    const t = unoTables()
    t.uno_sessions[0].phase = 'swap_target'
    const db = leaveAfterRead(t)
    const res = await processUnoSwap(db.supabase, 'G', 'A', 'B')
    expect(res).toEqual({ skipped: true })
    // Nothing was swapped.
    expect(t.uno_player_hands[0].cards).toEqual([{ id: 'A1', color: 'red', value: '5' }])
  })

  it('processUnoSwap still swaps when nothing raced', async () => {
    const t = unoTables()
    t.uno_sessions[0].phase = 'swap_target'
    const res = await processUnoSwap(makeDb(t).supabase, 'G', 'A', 'B')
    expect(res).toEqual({})
    expect(t.uno_player_hands[0].cards).toEqual([{ id: 'B1', color: 'red', value: '5' }])
  })

  it('processUnoPlay still lands when nothing raced', async () => {
    const t = unoTables()
    const db = makeDb(t)
    const res = await processUnoPlay(db.supabase, 'G', 'A', 'A1')
    expect(res.skipped).toBeUndefined()
    expect(t.uno_sessions[0].updated_at).not.toBe(T0)
  })
})

describe('processUnoExpireTurn — settlement of the delegated result', () => {
  const expiredTables = () => {
    const t = unoTables()
    t.uno_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'
    return t
  }

  it('keeps a database error from the delegated play even when the session version also moved', async () => {
    const t = expiredTables()
    let reads = 0
    const db = makeDb(t, {
      failUpdates: (table) => table === 'uno_sessions',
      failRpc: (name) => name === 'finish_uno_session',
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        // Read #1 is the expire load, read #2 the delegate's: a later write bumps the version after it.
        if (++reads === 2) t.uno_sessions[0].updated_at = '2026-01-01T00:00:09.000Z'
      },
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.skipped).toBeUndefined()
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('still converts a stale validation error to skipped when the session moved', async () => {
    const t = expiredTables()
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || ++reads !== 1) return
        t.uno_sessions[0].current_turn_index = 1
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    // A lost claim is a conflict (409 at the route); a not-yet-due poke is a plain skip.
    expect(await processUnoExpireTurn(db.supabase, 'G')).toEqual({ skipped: true, conflict: true })
  })

  it('a poke before the turn is due is a plain skip, not a conflict', async () => {
    const t = expiredTables()
    t.uno_sessions[0].turn_deadline_at = new Date(Date.now() + 60_000).toISOString()
    expect(await processUnoExpireTurn(makeDb(t).supabase, 'G')).toEqual({ skipped: true })
    t.uno_sessions[0].phase = 'finished'
    expect(await processUnoExpireTurn(makeDb(t).supabase, 'G')).toEqual({ skipped: true })
  })
})

describe('expiry and call outcomes are not mislabelled', () => {
  const bumpAfterFirstRead = (t: Tables) => {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
  }
  const expiredGame = {
    id: 'G',
    status: 'active',
    session_started_at: '2020-01-01T00:00:00.000Z',
    game_duration_seconds: 60,
    uno_team_mode: false,
  } as unknown as Parameters<typeof finishExpiredUnoGame>[1]

  it('finishExpiredUnoGame reports false (not a finished round) when its finish CAS loses', async () => {
    const t = unoTables()
    expect(await finishExpiredUnoGame(bumpAfterFirstRead(t).supabase, expiredGame)).toEqual({ won: false })
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('finishExpiredUnoGame reports true when the finish lands', async () => {
    const t = unoTables()
    expect(await finishExpiredUnoGame(makeDb(t).supabase, expiredGame)).toEqual({ won: true })
    expect(t.uno_sessions[0].phase).toBe('finished')
  })

  it('a "nobody can play" finish that loses its CAS reports skipped, not success', async () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      draw_pile: [],
      discard_pile: [],
    })
    expect(await processUnoDraw(bumpAfterFirstRead(t).supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(t.uno_sessions[0].phase).toBe('playing')
    const t2 = unoTables()
    Object.assign(t2.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      draw_pile: [],
      discard_pile: [],
    })
    expect(await processUnoDraw(makeDb(t2).supabase, 'G', 'A')).toEqual({})
    expect(t2.uno_sessions[0].phase).toBe('finished')
  })

  // The current player holds no cards: expiry just advances the turn, and that write can lose its CAS.
  const emptyHandTables = () => {
    const t = unoTables()
    t.uno_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'
    t.uno_player_hands[0].cards = []
    return t
  }

  it('expiry of an empty-handed seat reports skipped, not success, when its write loses the CAS', async () => {
    const t = emptyHandTables()
    const res = await processUnoExpireTurn(bumpAfterFirstRead(t).supabase, 'G')
    expect(res).toEqual({ skipped: true, conflict: true })
    expect(t.uno_sessions[0].current_turn_index).toBe(0)
  })

  it('expiry of an empty-handed seat reports a database error instead of success', async () => {
    const t = emptyHandTables()
    const res = await processUnoExpireTurn(makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G')
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('expiry of an empty-handed seat still advances the turn when nothing raced', async () => {
    const t = emptyHandTables()
    expect(await processUnoExpireTurn(makeDb(t).supabase, 'G')).toEqual({})
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
  })

  it('processUnoCall reports skipped when the CAS loses, an error when the write fails, success otherwise', async () => {
    const mk = () => {
      const t = unoTables()
      t.uno_sessions[0].uno_pending_player = 'A'
      return t
    }
    const lost = mk()
    expect(await processUnoCall(bumpAfterFirstRead(lost).supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(lost.uno_sessions[0].uno_called).toBeUndefined()
    const failed = await processUnoCall(makeDb(mk(), { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A')
    expect(failed.error).toBe(INTERNAL_ERROR_MESSAGE)
    const ok = mk()
    expect(await processUnoCall(makeDb(ok).supabase, 'G', 'A')).toEqual({})
    expect(ok.uno_sessions[0].uno_called).toBe(true)
  })
})

describe('removeUnoPlayer — stacked Wild Draw Four penalty (phase playing)', () => {
  // Stacking on: A played +4, B stacked +4 (total 8) ... here C is the target holding the pending +8,
  // played last by A. Penalty stays in phase 'playing' on the current player (index 2 = C).
  function stackedTables() {
    const t = unoTables()
    t.games[0].uno_stacking = true
    const s = t.uno_sessions[0]
    s.phase = 'playing'
    s.current_turn_index = 2
    s.wd4_player_id = 'A'
    s.challenge_prev_color = 'red'
    s.draw_penalty = 8
    s.draw_penalty_kind = 'wild_draw4'
    s.draw_pile = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, color: 'blue', value: '1' }))
    s.discard_pile = []
    return t
  }
  const handCount = (t: Tables, id: string) =>
    ((t.uno_player_hands.find((h) => h.player_id === id)?.cards as unknown[]) ?? []).length

  it('a challenge after the +4 player leaves is a plain accept: target draws exactly the stack and is skipped', async () => {
    const t = stackedTables()
    const db = makeDb(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'A', 'A')
    expect(res.error).toBeNull()
    expect(t.uno_sessions[0].wd4_player_id).toBeNull()
    expect(t.uno_sessions[0].phase).toBe('playing')
    expect(t.uno_sessions[0].draw_penalty).toBe(8)
    // turn_order is now [B, C, D]; C (the target) sits at index 1.
    expect(t.uno_sessions[0].turn_order).toEqual(['B', 'C', 'D'])
    expect(t.uno_sessions[0].current_turn_index).toBe(1)

    const before = handCount(t, 'C')
    const out = await processUnoChallenge(db.supabase, 'G', 'C', true)
    expect(out.error).toBeUndefined()
    // Exactly the pending stack (8): no failed-challenge extra.
    expect(handCount(t, 'C') - before).toBe(8)
    const s = t.uno_sessions[0]
    expect(s.draw_penalty).toBe(0)
    expect(s.draw_penalty_kind).toBeNull()
    expect(s.current_turn_index).toBe(2) // skipped past C to D
  })

  it('reports the cards actually drawn, not the pending stack, when the deck runs short', async () => {
    const t = stackedTables()
    t.uno_sessions[0].draw_pile = [
      { id: 'p0', color: 'blue', value: '1' },
      { id: 'p1', color: 'blue', value: '2' },
    ]
    const db = makeDb(t)
    await removeUnoPlayer(db.supabase, 'G', 'A', 'A')
    const before = handCount(t, 'C')
    const out = await processUnoChallenge(db.supabase, 'G', 'C', true)
    expect(out.error).toBeUndefined()
    expect(handCount(t, 'C') - before).toBe(2)
    expect(String(t.uno_sessions[0].status_message)).toContain('drew 2 ')
  })

  it('still refuses a challenge from a player who is not the current player', async () => {
    const t = stackedTables()
    const db = makeDb(t)
    await removeUnoPlayer(db.supabase, 'G', 'A', 'A')
    const out = await processUnoChallenge(db.supabase, 'G', 'D', true)
    expect(out.error).toBe('Not your decision')
    expect(t.uno_sessions[0].draw_penalty).toBe(8)
  })

  it('refuses a challenge when no stacked penalty is pending', async () => {
    const t = stackedTables()
    t.uno_sessions[0].draw_penalty = 0
    t.uno_sessions[0].wd4_player_id = null
    const db = makeDb(t)
    const out = await processUnoChallenge(db.supabase, 'G', 'C', true)
    expect(out.error).toBe('No Wild Draw Four to challenge')
  })

  it('non-leaver case unchanged: challenge is adjudicated against the +4 player real hand', async () => {
    const t = stackedTables()
    t.uno_player_hands.find((h) => h.player_id === 'A')!.cards = [{ id: 'A1', color: 'red', value: '5' }]
    const db = makeDb(t)
    const beforeA = handCount(t, 'A')
    const out = await processUnoChallenge(db.supabase, 'G', 'C', true)
    expect(out.error).toBeUndefined()
    // A held red (prev colour): challenge succeeds, A draws the stack.
    expect(handCount(t, 'A') - beforeA).toBe(8)
  })
})

describe('removeUnoPlayer — Wild Draw Four challenge', () => {
  // A (index 0) played a Wild Draw Four; B (index 1) owns the challenge window.
  function wd4Tables(handOfA: Row[]) {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.phase = 'challenge_window'
    s.current_turn_index = 1
    s.wd4_player_id = 'A'
    s.challenge_prev_color = 'red'
    s.draw_penalty = 4
    s.draw_penalty_kind = 'wild_draw4'
    s.draw_pile = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, color: 'blue', value: '1' }))
    s.discard_pile = []
    t.uno_player_hands.find((h) => h.player_id === 'A')!.cards = handOfA
    return t
  }
  const handCount = (t: Tables, id: string) =>
    ((t.uno_player_hands.find((h) => h.player_id === id)?.cards as unknown[]) ?? []).length

  it('drops the challenge when the +4 player leaves, so a later challenge is a plain accept (no failed-challenge penalty)', async () => {
    // A held a red card (the challenge would have WON); either way B must not be punished.
    const t = wd4Tables([{ id: 'A1', color: 'red', value: '5' }])
    const db = makeDb(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'A', 'A')
    expect(res.error).toBeNull()
    const s = t.uno_sessions[0]
    expect(s.turn_order).toEqual(['B', 'C', 'D'])
    expect(s.phase).toBe('challenge_window')
    expect(s.wd4_player_id).toBeNull()
    expect(s.challenge_prev_color).toBeNull()

    const before = handCount(t, 'B')
    const out = await processUnoChallenge(db.supabase, 'G', 'B', true)
    expect(out.error).toBeUndefined()
    // Exactly the +4, not +6 (failed-challenge extra).
    expect(handCount(t, 'B') - before).toBe(4)
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('Team-Up: the +4 player leaving also drops the challenge', async () => {
    const t = wd4Tables([{ id: 'A1', color: 'red', value: '5' }])
    t.games[0].uno_team_mode = true
    const res = await removeUnoPlayer(makeDb(t).supabase, 'G', 'A', 'A')
    expect(res.error).toBeNull()
    const s = t.uno_sessions[0]
    expect(s.left_player_ids).toEqual(['A'])
    expect(s.wd4_player_id).toBeNull()
    expect(s.challenge_prev_color).toBeNull()
  })

  it('keeps the challenge intact when an unrelated player leaves', async () => {
    const t = wd4Tables([{ id: 'A1', color: 'red', value: '5' }])
    const db = makeDb(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'D', 'D')
    expect(res.error).toBeNull()
    const s = t.uno_sessions[0]
    expect(s.phase).toBe('challenge_window')
    expect(s.wd4_player_id).toBe('A')
    expect(s.challenge_prev_color).toBe('red')
    const before = handCount(t, 'A')
    const out = await processUnoChallenge(db.supabase, 'G', 'B', true)
    expect(out.error).toBeUndefined()
    // Challenge still adjudicated against A's real hand: A held red, so A draws 4.
    expect(handCount(t, 'A') - before).toBe(4)
  })
})

describe('session lookup errors on leave', () => {
  it('uno: a failed lookup returns the internal error and deletes nothing', async () => {
    const t = unoTables()
    const res = await removeUnoPlayer(makeDb(t, { failSelect: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'C', 'C')
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('C')
    expect(t.uno_sessions[0].turn_order).toEqual(['A', 'B', 'C', 'D'])
  })

  it('uno: a successful lookup with no session row still cleans up', async () => {
    const t = unoTables()
    t.uno_sessions = []
    expect((await removeUnoPlayer(makeDb(t).supabase, 'G', 'C', 'C')).error).toBeNull()
    expect(t.players.map((p) => p.id)).not.toContain('C')
  })
})

describe('uno draw — deck runs out in No Mercy', () => {
  const light = (id: string) => ({ id, color: 'red', kind: 'number', value: 5 })
  function noMercy(): Tables {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_player_hands.forEach((h) => {
      h.cards = [light(`${h.player_id}1`)]
    })
    return t
  }
  const lostCas = (t: Tables) => {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
  }

  const midPenalty = () => {
    const t = noMercy()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 'top', color: 'red', kind: 'number', value: 3 },
      draw_pile: [{ id: 'w1', color: 'wild', kind: 'wild' }],
      discard_pile: [],
      draw_penalty: 6,
      draw_penalty_kind: 'draw2',
      draw_stack_chain: 0,
    })
    return t
  }

  it('mid-penalty: a finish that loses its CAS reports skipped, one that lands reports success', async () => {
    const lost = midPenalty()
    const before = JSON.stringify({ hands: lost.uno_player_hands, pile: lost.uno_sessions[0].draw_pile })
    expect(await processUnoDraw(lostCas(lost).supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(lost.uno_sessions[0].phase).toBe('playing')
    // Nothing was written before the claim: A's hand and the stored pile are exactly what they were.
    expect(JSON.stringify({ hands: lost.uno_player_hands, pile: lost.uno_sessions[0].draw_pile })).toBe(before)
    const won = midPenalty()
    expect(await processUnoDraw(makeDb(won).supabase, 'G', 'A')).toEqual({})
    expect(won.uno_sessions[0].phase).toBe('finished')
    // The Wild reached A's hand exactly once, and the stored pile no longer holds it.
    const aCards = won.uno_player_hands[0].cards as { id: string }[]
    expect(aCards.filter((c) => c.id === 'w1')).toHaveLength(1)
    expect(won.uno_sessions[0].draw_pile).toEqual([])
  })

  it('mid-penalty: a database error on the finish claim writes nothing either', async () => {
    const t = midPenalty()
    const before = JSON.stringify({ hands: t.uno_player_hands, pile: t.uno_sessions[0].draw_pile })
    const res = await processUnoDraw(
      makeDb(t, { failRpc: (n) => n === 'apply_uno_move' || n === 'finish_uno_session' }).supabase,
      'G',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(JSON.stringify({ hands: t.uno_player_hands, pile: t.uno_sessions[0].draw_pile })).toBe(before)
  })

  const roulette = () => {
    const t = noMercy()
    Object.assign(t.uno_sessions[0], {
      phase: 'color_roulette',
      color_roulette_player_id: 'A',
      required_color: 'blue',
      draw_pile: [],
      discard_pile: [],
    })
    return t
  }

  it('roulette: a finish that loses its CAS reports skipped, one that lands reports success', async () => {
    const lost = roulette()
    expect(await processUnoDraw(lostCas(lost).supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(lost.uno_sessions[0].phase).toBe('color_roulette')
    const won = roulette()
    expect(await processUnoDraw(makeDb(won).supabase, 'G', 'A')).toEqual({})
    expect(won.uno_sessions[0].phase).toBe('finished')
  })
})

function scrabbleTables(): Tables {
  return {
    games: [
      {
        id: 'G',
        timer_seconds: 0,
        status: 'active',
        session_started_at: '2020-01-01T00:00:00.000Z',
        sessions_played: 1,
      },
    ],
    players: names.slice(0, 3).map((p) => ({ ...p })),
    scrabble_player_state: names
      .slice(0, 3)
      .map((p) => ({ id: `st-${p.id}`, game_id: 'G', player_id: p.id, score: 0, timed_out: false })),
    scrabble_sessions: [
      {
        game_id: 'G',
        phase: 'playing',
        turn_order: ['A', 'B', 'C'],
        current_turn_index: 0,
        consecutive_passes: 0,
        clock_mode: 'turn',
        updated_at: T0,
      },
    ],
  }
}

describe('removeScrabblePlayer — a reopened lobby', () => {
  it('deletes the seat of a leaver in a waiting lobby whose finished session is still around', async () => {
    const t = scrabbleTables()
    t.games[0].status = 'waiting'
    t.scrabble_sessions[0].phase = 'finished'
    expect(await removeScrabblePlayer(makeDb(t).supabase, 'G', 'B', 'B')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).not.toContain('B')
    expect(t.scrabble_player_state.map((x) => x.player_id)).not.toContain('B')
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'C'])
    // a repeated leave is still fine
    expect(await removeScrabblePlayer(makeDb(t).supabase, 'G', 'B', 'B')).toEqual({ error: null })
  })

  it('two leaves of a reopened lobby racing each other both end up out of turn_order (the loser retries)', async () => {
    const t = scrabbleTables()
    t.games[0].status = 'waiting'
    t.scrabble_sessions[0].phase = 'finished'
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        // B's leave commits its seat removal (new version) after C's leave read the session
        t.scrabble_sessions[0].turn_order = ['A', 'C']
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:05.000Z'
        t.players = t.players.filter((p) => p.id !== 'B')
        t.scrabble_player_state = t.scrabble_player_state.filter((x) => x.player_id !== 'B')
      },
    })
    expect(await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')).toEqual({ error: null })
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A'])
    expect(t.players.map((p) => p.id)).toEqual(['A'])
  })

  it('a finished (not reopened) game keeps its seats', async () => {
    const t = scrabbleTables()
    t.games[0].status = 'finished'
    t.scrabble_sessions[0].phase = 'finished'
    expect(await removeScrabblePlayer(makeDb(t).supabase, 'G', 'B', 'B')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).toContain('B')
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B', 'C'])
  })
})

describe('removeScrabblePlayer — races with concurrent writes', () => {
  it('does not clobber a concurrent play: recomputes the turn from the fresh session', async () => {
    const t = scrabbleTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'scrabble_sessions' || raced) return
        raced = true
        // A plays and the turn moves to B before C's leave write lands.
        const s = t.scrabble_sessions[0]
        s.current_turn_index = 1
        s.updated_at = '2026-01-01T00:00:01.000Z'
      },
    })
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B'])
    // A stale snapshot would put the turn back on A (a second turn); the fresh one keeps B.
    expect(t.scrabble_sessions[0].current_turn_index).toBe(1)
  })

  it('does not drop a concurrent leave', async () => {
    const t = scrabbleTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'scrabble_sessions' || raced) return
        raced = true
        const s = t.scrabble_sessions[0]
        s.turn_order = ['B', 'C']
        s.current_turn_index = 0
        s.updated_at = '2026-01-01T00:00:01.000Z'
        t.players = t.players.filter((p) => p.id !== 'A')
      },
    })
    // C leaves from a snapshot that still lists A; A's leave commits first.
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.scrabble_sessions[0].turn_order).toEqual(['B'])
    expect(t.scrabble_sessions[0].phase).toBe('finished')
    // A's stale state row is still there (its own leave has not cleaned up yet) but A is not a seat any more:
    // the only remaining player wins outright, not a tie with the departed seat.
    expect(t.scrabble_player_state.map((x) => x.player_id)).toContain('A')
    expect(t.scrabble_sessions[0].winner_player_id).toBe('B')
    expect(t.scrabble_sessions[0].is_tie).toBe(false)
  })

  it('reports a conflict and keeps the players row when the session keeps changing', async () => {
    const t = scrabbleTables()
    let n = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'scrabble_sessions') return
        t.scrabble_sessions[0].updated_at = `2026-01-01T00:00:${String(++n).padStart(2, '0')}.000Z`
      },
    })
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBe(SCRABBLE_REMOVE_CONFLICT_ERROR)
    expect(t.players.map((p) => p.id)).toContain('C')
  })
})

describe('removeScrabblePlayer — session lookup error', () => {
  it('returns the internal error and keeps the player rows', async () => {
    const t = scrabbleTables()
    const res = await removeScrabblePlayer(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_sessions' }).supabase,
      'G',
      'C',
      'C'
    )
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.scrabble_player_state.map((x) => x.player_id)).toContain('C')
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B', 'C'])
  })

  it('a successful lookup with no session row still cleans up', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions = []
    expect((await removeScrabblePlayer(makeDb(t).supabase, 'G', 'C', 'C')).error).toBeNull()
    expect(t.players.map((p) => p.id)).not.toContain('C')
  })
})

describe('leave — a failed players delete is not echoed to the client', () => {
  it('uno: returns the generic internal message', async () => {
    const t = unoTables()
    const res = await removeUnoPlayer(makeDb(t, { failDeletes: (tb) => tb === 'players' }).supabase, 'G', 'C', 'C')
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('uno Team-Up and no-session cleanup paths: the generic internal message too', async () => {
    const team = unoTables()
    team.games[0].uno_team_mode = true
    const failing = { failDeletes: (tb: string) => tb === 'players' }
    expect((await removeUnoPlayer(makeDb(team, failing).supabase, 'G', 'C', 'C')).error).toBe(INTERNAL_ERROR_MESSAGE)
    const none = unoTables()
    none.uno_sessions = []
    expect((await removeUnoPlayer(makeDb(none, failing).supabase, 'G', 'C', 'C')).error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('scrabble: returns the generic internal message', async () => {
    const t = scrabbleTables()
    const res = await removeScrabblePlayer(makeDb(t, { failDeletes: (tb) => tb === 'players' }).supabase, 'G', 'C', 'C')
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })
})

describe('processUnoTeamLeaveDecision — lost CAS is skipped', () => {
  const pausedTables = () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], { phase: 'team_leave_decision', team_decider_id: 'C', left_player_ids: ['A'] })
    return t
  }
  const lostAfterRead = (t: Tables) => {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
  }

  it.each(['continue', 'forfeit'] as const)('%s reports skipped and leaves the phase paused', async (decision) => {
    const t = pausedTables()
    expect(await processUnoTeamLeaveDecision(lostAfterRead(t).supabase, 'G', 'C', decision)).toEqual({ skipped: true })
    expect(t.uno_sessions[0].phase).toBe('team_leave_decision')
  })

  it('continue still commits when nothing raced', async () => {
    const t = pausedTables()
    expect(await processUnoTeamLeaveDecision(makeDb(t).supabase, 'G', 'C', 'continue')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('playing')
  })
})

describe('finish write outcomes are three-state (landed / lost / failed)', () => {
  const expiredGame = {
    id: 'G',
    status: 'active',
    session_started_at: '2020-01-01T00:00:00.000Z',
    game_duration_seconds: 60,
    uno_team_mode: false,
  } as unknown as Parameters<typeof finishExpiredUnoGame>[1]

  it('finishExpiredUnoGame reports a failed finish write as an error, not a lost race', async () => {
    const t = unoTables()
    const res = await finishExpiredUnoGame(
      makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions', failRpc: (n) => n === 'finish_uno_session' }).supabase,
      expiredGame
    )
    expect(res).toEqual({ won: false, error: INTERNAL_ERROR_MESSAGE })
  })

  it('finishExpiredUnoGame reports a failed session read as an error', async () => {
    const t = unoTables()
    const res = await finishExpiredUnoGame(
      makeDb(t, { failSelect: (tb) => tb === 'uno_sessions' }).supabase,
      expiredGame
    )
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  const expiredRound = () => {
    const t = unoTables()
    t.games[0].session_started_at = '2020-01-01T00:00:00.000Z'
    t.games[0].game_duration_seconds = 60
    return t
  }

  it('a move on an expired round returns the finish error (and does not move) when the finish write fails', async () => {
    const t = expiredRound()
    const res = await processUnoPlay(
      makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions', failRpc: (n) => n === 'finish_uno_session' }).supabase,
      'G',
      'A',
      'A1'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(t.uno_sessions[0].current_turn_index).toBe(0)
  })

  it('a move on an expired round reports skipped when the finish loses its CAS, "Time\'s up" when it lands', async () => {
    const lost = expiredRound()
    let raced = false
    const db = makeDb(lost, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        lost.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({ skipped: true })
    const won = expiredRound()
    expect((await processUnoPlay(makeDb(won).supabase, 'G', 'A', 'A1')).error).toContain("Time's up")
  })

  it('a database error inside a draw-path finish is an error, not skipped', async () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      draw_pile: [],
      discard_pile: [],
    })
    const res = await processUnoDraw(
      makeDb(t, { failRpc: (n) => n === 'apply_uno_move' || n === 'finish_uno_session' }).supabase,
      'G',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })
})

describe('processUnoDraw — empty pile: no derived write before the session write lands', () => {
  // Nobody holds a card A can match, but B can play: the draw just passes the turn.
  const emptyPileTables = () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      // Exactly two cards: B's missed-UNO penalty consumes the whole pile, so A's own draw is empty.
      draw_pile: [
        { id: 'p1', color: 'green', kind: 'number', value: 1 },
        { id: 'p2', color: 'green', kind: 'number', value: 2 },
      ],
      discard_pile: [],
      uno_pending_player: 'B',
      uno_called: false,
    })
    t.uno_player_hands[1].cards = [{ id: 'B1', color: 'blue', kind: 'skip' }]
    return t
  }
  const bHand = (t: Tables) => (t.uno_player_hands[1].cards as unknown[]).length

  it('a lost CAS reports skipped, leaves the turn alone and does not give B the penalty cards', async () => {
    const t = emptyPileTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoDraw(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(t.uno_sessions[0].current_turn_index).toBe(0)
    expect(bHand(t)).toBe(1)
  })

  it('a database error reports the error and writes no hand', async () => {
    const t = emptyPileTables()
    const res = await processUnoDraw(
      makeDb(t, { failRpc: (n) => n === 'apply_uno_move' || n === 'finish_uno_session' }).supabase,
      'G',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(bHand(t)).toBe(1)
  })

  it('still passes the turn when nothing raced, and B receives both penalty cards', async () => {
    const t = emptyPileTables()
    expect(await processUnoDraw(makeDb(t).supabase, 'G', 'A')).toEqual({})
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
    expect(bHand(t)).toBe(3)
  })
})

describe('Mercy knockout — committed in the same transaction as the move that causes it', () => {
  const card = (id: string) => ({ id, color: 'red', kind: 'number', value: 5 })
  const swapTables = () => {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_sessions[0].phase = 'swap_target'
    t.uno_player_hands[1].cards = Array.from({ length: 25 }, (_, i) => card(`B${i}`))
    return t
  }
  const spy = (db: ReturnType<typeof makeDb>) => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const realRpc = db.supabase.rpc
    db.supabase.rpc = (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return realRpc(name, args)
    }
    return calls
  }

  it('the swap and the knockout it causes are ONE move call', async () => {
    const t = swapTables()
    const db = makeDb(t)
    const calls = spy(db)
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({})
    expect(calls.filter((c) => c.name === 'apply_uno_move')).toHaveLength(1)
    expect(t.uno_player_hands[0].cards).toEqual([])
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual(['A'])
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBe(true)
    // the knocked-out cards went back to the draw pile with the same write
    expect(((t.uno_sessions[0].draw_pile as unknown[]) ?? []).length).toBe(25)
  })

  it('a competing write that wins the claim leaves neither the swap nor the knockout written', async () => {
    const t = swapTables()
    const before = JSON.stringify(t.uno_player_hands)
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb === 'uno_sessions' && ++reads === 1) t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({ skipped: true })
    expect(JSON.stringify(t.uno_player_hands)).toBe(before)
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBeUndefined()
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual([])
  })

  it('a failed write leaves neither the move nor the knockout (the move is simply retried, never half-applied)', async () => {
    const t = swapTables()
    const before = JSON.stringify(t.uno_player_hands)
    const db = makeDb(t, { failRpc: (n) => n === 'apply_uno_move' })
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(JSON.stringify(t.uno_player_hands)).toBe(before)
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual([])
    expect(t.uno_sessions[0].phase).toBe('swap_target')
  })

  it('a 0-rotation that hands a seat 25 cards commits the rotation and the knockout together', async () => {
    const t = unoTables()
    Object.assign(t.games[0], { uno_mode: 'no_mercy', uno_zero_seven: true })
    Object.assign(t.uno_sessions[0], { top_card: { id: 'top', color: 'red', kind: 'number', value: 3 } })
    t.uno_player_hands[0].cards = [
      { id: 'zero', color: 'red', kind: 'number', value: 0 },
      ...Array.from({ length: 25 }, (_, i) => card(`A${i}`)),
    ]
    const db = makeDb(t)
    const calls = spy(db)
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'zero')).toEqual({})
    expect(calls.filter((c) => c.name === 'apply_uno_move')).toHaveLength(1)
    // direction 1: every hand moves to the next seat, so B received A's 25 cards and is knocked out
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual(['B'])
    expect(t.uno_player_hands[1].cards).toEqual([])
    expect(t.players.find((p) => p.id === 'B')!.spectator).toBe(true)
  })

  it('two knockouts from one swap both land, and both hands return to the pile', async () => {
    const t = swapTables()
    t.uno_player_hands[0].cards = Array.from({ length: 25 }, (_, i) => card(`A${i}`))
    expect(await processUnoSwap(makeDb(t).supabase, 'G', 'A', 'B')).toEqual({})
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual(['A', 'B'])
    expect((t.uno_sessions[0].draw_pile as unknown[]).length).toBe(50)
  })

  it('a forced draw that crosses the limit commits the draw and the knockout together, crediting the setter', async () => {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 'top', color: 'red', kind: 'number', value: 3 },
      draw_pile: [card('d1'), card('d2')],
      draw_penalty: 2,
      draw_penalty_kind: 'draw2',
      last_play_player_id: 'C',
    })
    t.uno_player_hands[0].cards = Array.from({ length: 23 }, (_, i) => ({ ...card(`A${i}`), color: 'blue' }))
    const db = makeDb(t)
    const calls = spy(db)
    expect(await processUnoDraw(db.supabase, 'G', 'A')).toEqual({})
    expect(calls.filter((c) => c.name === 'apply_uno_move')).toHaveLength(1)
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual(['A'])
    expect(t.uno_player_hands[0].cards).toEqual([])
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBe(true)
    expect((t.uno_sessions[0].draw_pile as unknown[]).length).toBe(25)
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
    expect((t.uno_player_hands[2].stats as Record<string, number>).uno_hs_knockouts).toBe(1)
  })

  it('a forced draw that crosses the limit loses cleanly: no draw, no knockout, no stats', async () => {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 'top', color: 'red', kind: 'number', value: 3 },
      draw_pile: [card('d1'), card('d2')],
      draw_penalty: 2,
      draw_penalty_kind: 'draw2',
      last_play_player_id: 'C',
    })
    t.uno_player_hands[0].cards = Array.from({ length: 23 }, (_, i) => ({ ...card(`A${i}`), color: 'blue' }))
    const before = JSON.stringify(t.uno_player_hands)
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoDraw(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(JSON.stringify(t.uno_player_hands)).toBe(before)
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual([])
  })

  it('a knockout that ends the round is part of the draw finish (one finish call, setter who left is not written)', async () => {
    const t = unoTables()
    Object.assign(t.games[0], { uno_mode: 'no_mercy', uno_no_mercy_win: 'last_standing' })
    // Three seats became two when C left earlier (C's hand row and seat are gone); C set the pending penalty.
    t.uno_sessions[0].turn_order = ['A', 'B']
    t.uno_player_hands = t.uno_player_hands.filter((h) => h.player_id === 'A' || h.player_id === 'B')
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 'top', color: 'red', kind: 'number', value: 3 },
      draw_pile: [card('d1'), card('d2')],
      draw_penalty: 2,
      draw_penalty_kind: 'draw2',
      last_play_player_id: 'C',
    })
    t.uno_player_hands[0].cards = Array.from({ length: 23 }, (_, i) => ({ ...card(`A${i}`), color: 'blue' }))
    const db = makeDb(t)
    const calls = spy(db)
    expect(await processUnoDraw(db.supabase, 'G', 'A')).toEqual({})
    expect(calls.filter((c) => c.name === 'apply_uno_move')).toHaveLength(0)
    const finish = calls.filter((c) => c.name === 'finish_uno_session')
    expect(finish).toHaveLength(1)
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.uno_sessions[0].winner_player_id).toBe('B')
    expect(t.uno_sessions[0].eliminated_player_ids).toEqual(['A'])
    expect(t.games[0].status).toBe('finished')
    expect((finish[0].args.p_hand_writes as { player_id: string }[]).map((w) => w.player_id)).not.toContain('C')
  })
})

describe('failed state reads are internal errors, not "not found"', () => {
  it('uno: processUnoDraw and processUnoCall', async () => {
    const t = unoTables()
    const failing = makeDb(t, { failSelect: (tb) => tb === 'uno_sessions' }).supabase
    expect(await processUnoDraw(failing, 'G', 'A')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(await processUnoCall(failing, 'G', 'A')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })

  it('uno: a successful read with no row is still "Session not found"', async () => {
    const t = unoTables()
    t.uno_sessions = []
    expect(await processUnoDraw(makeDb(t).supabase, 'G', 'A')).toEqual({ error: 'Session not found' })
  })

  it('scrabble: a failed session read is an internal error', async () => {
    const t = scrabbleTables()
    const res = await processScrabblePass(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_sessions' }).supabase,
      'G',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })
})

describe('scrabble session writes: lost CAS is skipped, database error is an error', () => {
  const passTables = () => {
    const t = scrabbleTables()
    t.scrabble_sessions[0].bag = []
    return t
  }

  it('processScrabblePass', async () => {
    const lost = passTables()
    let raced = false
    const db = makeDb(lost, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        lost.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(lost.scrabble_sessions[0].current_turn_index).toBe(0)

    const failed = passTables()
    const res = await processScrabblePass(
      makeDb(failed, { failUpdates: (tb) => tb === 'scrabble_sessions' }).supabase,
      'G',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })

    const ok = passTables()
    expect(await processScrabblePass(makeDb(ok).supabase, 'G', 'A')).toEqual({})
    expect(ok.scrabble_sessions[0].current_turn_index).toBe(1)
  })

  it('processScrabbleExpireTurn: a database error is an error (a lost race stays a benign success)', async () => {
    const t = passTables()
    t.scrabble_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'
    const res = await processScrabbleExpireTurn(
      makeDb(t, { failUpdates: (tb) => tb === 'scrabble_sessions' }).supabase,
      'G'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })
})

describe('remaining session writes follow the same rule', () => {
  it('classic roulette with an empty pile: lost CAS is skipped, database error is an error', async () => {
    const mk = () => {
      const t = unoTables()
      Object.assign(t.uno_sessions[0], {
        phase: 'color_roulette',
        color_roulette_player_id: 'A',
        required_color: 'blue',
        draw_pile: [],
        discard_pile: [],
      })
      return t
    }
    const lost = mk()
    let raced = false
    const db = makeDb(lost, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        lost.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoDraw(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    const failed = await processUnoDraw(makeDb(mk(), { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A')
    expect(failed).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(await processUnoDraw(makeDb(mk()).supabase, 'G', 'A')).toEqual({})
  })

  it('scrabble early finish: a failed session read is an error, not "Session not found"', async () => {
    const t = scrabbleTables()
    const res = await finishScrabbleGameEarly(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_sessions' }).supabase,
      'G'
    )
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })
})

describe('a second expiry does not re-finalize a finished round', () => {
  const seriesTables = () => {
    const t = unoTables()
    Object.assign(t.games[0], {
      uno_series_scoring: true,
      uno_series_target: 100000,
      uno_series_scores: {},
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
    })
    return t
  }
  const game = () =>
    ({
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
      uno_team_mode: false,
    }) as unknown as Parameters<typeof finishExpiredUnoGame>[1]

  it('two expiries award the round series points exactly once and flip the games row', async () => {
    const t = seriesTables()
    const db = makeDb(t)
    expect(await finishExpiredUnoGame(db.supabase, game())).toEqual({ won: true })
    const once = JSON.stringify(t.games[0].uno_series_scores)
    expect(once).not.toBe('{}')
    // The second expiry still saw games.status 'active' (its own read predates the first request's flip).
    t.games[0].status = 'active'
    const second = await finishExpiredUnoGame(db.supabase, game())
    expect(second.error).toBeUndefined()
    // ...and the games row is completed idempotently by the second request.
    expect(t.games[0].status).toBe('finished')
    expect(JSON.stringify(t.games[0].uno_series_scores)).toBe(once)
  })

  it('a round a competing finisher already finished is never re-awarded: the function answers already_finished', async () => {
    const t = seriesTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        // A competing finisher committed the round between our read and our call.
        t.uno_sessions[0].phase = 'finished'
      },
    })
    expect(await finishExpiredUnoGame(db.supabase, game())).toEqual({ won: true })
    expect(t.games[0].uno_series_scores).toEqual({})
    expect(t.games[0].status).toBe('finished')
  })
})

describe('scrabble host end-game and finished-session repair', () => {
  it('a host end that loses the claim to a play while the round is still running is skipped', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        // Read #1 is the finalize load; the play lands right after it (the round stays active).
        if (tb === 'scrabble_sessions' && ++reads === 1) t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await finishScrabbleGameEarly(db.supabase, 'G')).toEqual({ error: null, skipped: true })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
  })

  it('a competing finish that committed (session and games row together) is a plain success', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || ++reads !== 1) return
        // The competing finish is ONE transaction: the session and the games row change together.
        t.scrabble_sessions[0].phase = 'finished'
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
        t.games[0].status = 'finished'
      },
    })
    expect(await finishScrabbleGameEarly(db.supabase, 'G')).toEqual({ error: null })
    expect(t.games[0].status).toBe('finished')
  })

  it('a finished session with the games row still active completes the flip without re-tallying scores', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions[0].phase = 'finished'
    t.games[0].status = 'active'
    const scoresBefore = JSON.stringify(t.scrabble_player_state)
    expect(await finishScrabbleGameEarly(makeDb(t).supabase, 'G')).toEqual({ error: null })
    expect(t.games[0].status).toBe('finished')
    expect(JSON.stringify(t.scrabble_player_state)).toBe(scoresBefore)
  })

  it('reports an unresolved games-row flip failure instead of success', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions[0].phase = 'finished'
    t.games[0].status = 'active'
    const res = await finishScrabbleGameEarly(
      makeDb(t, { failRpc: (n) => n === 'finish_scrabble_session' }).supabase,
      'G'
    )
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('the timer path observes the same unresolved flip failure and repairs a healthy one', async () => {
    const mk = () => {
      const t = scrabbleTables()
      t.scrabble_sessions[0].phase = 'finished'
      t.games[0].status = 'active'
      return t
    }
    const expiredGame = {
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
    } as unknown as Parameters<typeof finishExpiredScrabbleGame>[1]
    expect(
      await finishExpiredScrabbleGame(
        makeDb(mk(), { failRpc: (n) => n === 'finish_scrabble_session' }).supabase,
        expiredGame
      )
    ).toEqual({ finished: false, error: INTERNAL_ERROR_MESSAGE })
    const healthy = mk()
    expect(await finishExpiredScrabbleGame(makeDb(healthy).supabase, expiredGame)).toEqual({ finished: true })
    expect(healthy.games[0].status).toBe('finished')
  })

  it('a leave whose player-state read fails writes nothing', async () => {
    const t = scrabbleTables()
    const res = await removeScrabblePlayer(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_player_state' }).supabase,
      'G',
      'C',
      'C'
    )
    expect(res.error).toBe(INTERNAL_ERROR_MESSAGE)
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B', 'C'])
    expect(t.players.map((p) => p.id)).toContain('C')
  })
})

describe('scrabble finish: seated players only, honest rereads and expiry results', () => {
  const rackless = () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    return t
  }

  it('a host finish does not rank a seat that already left the turn order (stale state row)', async () => {
    const t = rackless()
    t.scrabble_sessions[0].turn_order = ['B', 'C']
    t.scrabble_player_state.find((x) => x.player_id === 'A')!.score = 99
    expect(await finishScrabbleGameEarly(makeDb(t).supabase, 'G')).toEqual({ error: null })
    expect(t.scrabble_sessions[0].winner_player_id).not.toBe('A')
    // ...and the stale row's score is not rewritten either
    expect(t.scrabble_player_state.find((x) => x.player_id === 'A')!.score).toBe(99)
  })

  it('a failed reread after a lost claim is an error, not a conflict', async () => {
    const t = rackless()
    let reads = 0
    const db = makeDb(t, {
      failSelect: (tb) => tb === 'scrabble_sessions' && reads >= 1 && reads++ >= 1,
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || reads > 0) return
        reads = 1
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await finishScrabbleGameEarly(db.supabase, 'G')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })

  it('expiry whose claim lost to a running round is not finished (and not an error)', async () => {
    const t = rackless()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    const expiredGame = {
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
    } as unknown as Parameters<typeof finishExpiredScrabbleGame>[1]
    expect(await finishExpiredScrabbleGame(db.supabase, expiredGame)).toEqual({ finished: false })
  })
})

describe('every Uno finish site is one finish_uno_session call', () => {
  const num = (id: string, color: string, value: number) => ({ id, color, kind: 'number', value })
  const going = (extra: Record<string, unknown> = {}) => {
    const t = unoTables()
    Object.assign(t.games[0], { uno_series_scoring: true, uno_series_target: 100000, uno_series_scores: {}, ...extra })
    Object.assign(t.uno_sessions[0], { top_card: num('top', 'red', 3) })
    t.uno_player_hands[0].cards = [num('A1', 'red', 5)]
    t.uno_player_hands[1].cards = [num('B1', 'blue', 9)]
    t.uno_player_hands[2].cards = [num('C1', 'blue', 4)]
    t.uno_player_hands[3].cards = [num('D1', 'blue', 6)]
    return t
  }

  it('a play that empties the last card finishes the round atomically', async () => {
    const t = going()
    expect(await processUnoPlay(makeDb(t).supabase, 'G', 'A', 'A1')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.uno_player_hands[0].cards).toEqual([])
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBe(true)
    expect(t.games[0].status).toBe('finished')
    // 9 + 4 + 6 left in the other hands
    expect(t.games[0].uno_series_scores).toEqual({ A: 19 })
  })

  it('the series award skips a seat that left (left_player_ids, or already out of turn_order) but still holds cards', async () => {
    // Team-Up style leaver: still in turn_order, marked left
    const left = going()
    left.uno_sessions[0].left_player_ids = ['C']
    expect(await processUnoPlay(makeDb(left).supabase, 'G', 'A', 'A1')).toEqual({})
    expect(left.games[0].uno_series_scores).toEqual({ A: 9 + 6 })
    // Standard leave: the turn_order change committed, the hand row not deleted yet
    const gone = going()
    gone.uno_sessions[0].turn_order = ['A', 'B', 'D']
    expect(await processUnoPlay(makeDb(gone).supabase, 'G', 'A', 'A1')).toEqual({})
    expect(gone.games[0].uno_series_scores).toEqual({ A: 9 + 6 })
  })

  it('hands are read only AFTER the session read resolved; a move committing in between makes the finish claim lose', async () => {
    const t = going()
    const db = makeDb(t)
    const log: string[] = []
    const realFrom = db.supabase.from
    db.supabase.from = (table: string) => {
      const b = realFrom(table) as unknown as {
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => unknown
      }
      const realThen = b.then.bind(b)
      if (table === 'uno_sessions') {
        // Hold the session read pending (a macrotask), so a parallel hands read would start before it resolves.
        b.then = (res, rej) => {
          log.push('session:start')
          return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
            const out = realThen(res, rej)
            log.push('session:done')
            return out
          })
        }
      }
      if (table === 'uno_player_hands') {
        b.then = (res, rej) => {
          log.push('hands:start')
          // another request's move commits its session version and its hands before this read returns
          t.uno_sessions[0].updated_at = '2026-01-01T00:00:09.000Z'
          t.uno_player_hands[1].cards = [num('B1', 'blue', 9), num('B2', 'blue', 20)]
          return realThen(res, rej)
        }
      }
      return b as never
    }
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({ skipped: true })
    expect(log.indexOf('hands:start')).toBeGreaterThan(log.indexOf('session:done'))
    expect(t.uno_sessions[0].phase).toBe('playing')
    expect(t.games[0].uno_series_scores).toEqual({})
  })

  it('a play that loses the finish claim changes nothing', async () => {
    const t = going()
    const before = JSON.stringify({ players: t.players, hands: t.uno_player_hands, games: t.games })
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    const topBefore = JSON.stringify(t.uno_sessions[0].top_card)
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({ skipped: true })
    expect(t.uno_player_hands[0].cards).toEqual([num('A1', 'red', 5)])
    expect(t.games[0].status).toBe('active')
    expect(t.games[0].uno_series_scores).toEqual({})
    // every entity the rejected finish would have written is untouched (players incl. spectator flags, hands, games)
    expect(JSON.stringify({ players: t.players, hands: t.uno_player_hands, games: t.games })).toBe(before)
    expect(JSON.stringify(t.uno_sessions[0].top_card)).toBe(topBefore)
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('a multi-play that empties the hand finishes the round atomically', async () => {
    const t = going({ uno_multi_play_mode: 'same_color' })
    t.uno_player_hands[0].cards = [num('A1', 'red', 5), num('A2', 'red', 7)]
    expect(await processUnoPlayMulti(makeDb(t).supabase, 'G', 'A', ['A1', 'A2'])).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.uno_player_hands[0].cards).toEqual([])
    expect(t.games[0].status).toBe('finished')
    expect(t.games[0].uno_series_scores).toEqual({ A: 19 })
  })

  it('a teammate forfeit finishes the round atomically', async () => {
    const t = going({ uno_team_mode: true })
    Object.assign(t.uno_sessions[0], { phase: 'team_leave_decision', team_decider_id: 'C', left_player_ids: ['A'] })
    expect(await processUnoTeamLeaveDecision(makeDb(t).supabase, 'G', 'C', 'forfeit')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.games[0].status).toBe('finished')
  })

  it('a leave that ends the round removes the leaver and finishes in one call (retried after a lost claim)', async () => {
    const t = going()
    // Three players, one already out: the second leave leaves a lone survivor.
    t.uno_sessions[0].turn_order = ['A', 'B']
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await removeUnoPlayer(db.supabase, 'G', 'B', 'B')).toEqual({ error: null })
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.players.map((p) => p.id)).not.toContain('B')
    expect(t.uno_player_hands.map((h) => h.player_id)).not.toContain('B')
    expect(t.games[0].status).toBe('finished')
  })

  it('a Team-Up leave that removes the whole team finishes the round and removes the leaver in one call', async () => {
    const t = going({ uno_team_mode: true })
    // A's partner (C) holds no cards, so no teammate decision is possible: the other team wins.
    t.uno_player_hands[2].cards = []
    expect(await removeUnoPlayer(makeDb(t).supabase, 'G', 'A', 'A')).toEqual({ error: null })
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.players.map((p) => p.id)).not.toContain('A')
    expect(t.games[0].status).toBe('finished')
  })

  it('a Team-Up finishing leave that loses the claim is retried against the fresh session', async () => {
    const t = going({ uno_team_mode: true })
    t.uno_player_hands[2].cards = []
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await removeUnoPlayer(db.supabase, 'G', 'A', 'A')).toEqual({ error: null })
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.players.map((p) => p.id)).not.toContain('A')
  })

  it('a finishing leave that finds the round already published retains the leaver in the result', async () => {
    const t = going()
    t.uno_sessions[0].turn_order = ['A', 'B']
    // The competing finish lands between the leave's read and its finish call.
    let raced = false
    const hooked = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].phase = 'finished'
      },
    })
    expect(await removeUnoPlayer(hooked.supabase, 'G', 'B', 'B')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).toContain('B')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('B')
    expect(t.games[0].uno_series_scores).toEqual({})
  })
})

describe('every Scrabble finish site is one finish_scrabble_session call', () => {
  it('a stalemate pass ends the round: scores, winner and the games flip land together', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    Object.assign(t.scrabble_sessions[0], { bag: [], consecutive_passes: 5 })
    t.scrabble_player_state.find((x) => x.player_id === 'B')!.score = 50
    expect(await processScrabblePass(makeDb(t).supabase, 'G', 'A')).toEqual({})
    expect(t.scrabble_sessions[0].phase).toBe('finished')
    expect(t.scrabble_sessions[0].winner_player_id).toBe('B')
    expect(t.games[0].status).toBe('finished')
  })

  it('a stalemate pass that loses the finish claim changes nothing', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    Object.assign(t.scrabble_sessions[0], { bag: [], consecutive_passes: 5 })
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
  })

  it('a leave that ends the round removes the leaver and finishes in one call', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions[0].turn_order = ['A', 'B']
    expect(await removeScrabblePlayer(makeDb(t).supabase, 'G', 'B', 'B')).toEqual({ error: null })
    expect(t.scrabble_sessions[0].phase).toBe('finished')
    expect(t.players.map((p) => p.id)).not.toContain('B')
    expect(t.scrabble_player_state.map((x) => x.player_id)).not.toContain('B')
    expect(t.games[0].status).toBe('finished')
  })
})

describe('round identity and mover writes around a finish', () => {
  const rackless = () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    return t
  }
  const expiredFor = (over: Record<string, unknown> = {}) =>
    ({
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      sessions_played: 1,
      game_duration_seconds: 60,
      ...over,
    }) as unknown as Parameters<typeof finishExpiredScrabbleGame>[1]

  it('scrabble expiry decided about an EARLIER round never finishes a later round', async () => {
    const t = rackless()
    // A rematch installed round 2 after the expiry snapshot (round 1) was taken.
    t.games[0].sessions_played = 2
    t.games[0].session_started_at = '2026-02-01T00:00:00.000Z'
    const res = await finishExpiredScrabbleGame(makeDb(t).supabase, expiredFor())
    expect(res).toEqual({ finished: false })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
    // ...while the same round finishes.
    const same = rackless()
    expect(await finishExpiredScrabbleGame(makeDb(same).supabase, expiredFor())).toEqual({ finished: true })
  })

  it('uno expiry decided about an EARLIER round never finishes a later round', async () => {
    const t = unoTables()
    t.games[0].sessions_played = 2
    const res = await finishExpiredUnoGame(makeDb(t).supabase, expiredFor() as never)
    expect(res).toEqual({ won: false, roundMismatch: true })
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('a move on a round that expired is not applied as a finish of a LATER round (rematch after the read)', async () => {
    const t = unoTables()
    Object.assign(t.games[0], { session_started_at: '2020-01-01T00:00:00.000Z', game_duration_seconds: 60 })
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        // 'players' is the last read of the state load.
        if (tb !== 'players' || raced) return
        raced = true
        // A rematch started a new round between the read and the finish.
        t.games[0].session_started_at = '2026-02-01T00:00:00.000Z'
      },
    })
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({ skipped: true })
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('a host finish with no state rows (failed read / nobody seated) writes nothing', async () => {
    const t = rackless()
    const failed = await finishScrabbleGameEarly(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_player_state' }).supabase,
      'G'
    )
    expect(failed).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    t.scrabble_player_state = []
    expect(await finishScrabbleGameEarly(makeDb(t).supabase, 'G')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
  })

  // A chess-clock pass that does not end the round: the clock deduction commits WITH the session claim.
  const chessPass = () => {
    const t = rackless()
    t.scrabble_sessions[0].clock_mode = 'chess'
    t.scrabble_player_state.forEach((x) => (x.clock_ms_remaining = 100_000))
    t.scrabble_sessions[0].turn_started_at = new Date(Date.now() - 10_000).toISOString()
    t.scrabble_sessions[0].bag = []
    return t
  }
  const spyRpc = (db: ReturnType<typeof makeDb>, before?: (name: string) => void) => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const realRpc = db.supabase.rpc
    db.supabase.rpc = (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      before?.(name)
      return realRpc(name, args)
    }
    return calls
  }
  const clockOf = (t: Tables) => t.scrabble_player_state.find((x) => x.player_id === 'A')!.clock_ms_remaining as number

  it('control: the session claim and the mover clock commit in ONE move call', async () => {
    const t = chessPass()
    const db = makeDb(t)
    const calls = spyRpc(db)
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({})
    const moves = calls.filter((c) => c.name === 'apply_scrabble_move')
    expect(moves).toHaveLength(1)
    const writes = moves[0].args.p_state_writes as { player_id: string; clock_ms_remaining: number }[]
    expect(writes[0].player_id).toBe('A')
    expect(writes[0].clock_ms_remaining).toBeLessThan(100_000)
    expect(clockOf(t)).toBeLessThan(100_000)
    expect(t.scrabble_sessions[0].current_turn_index).toBe(1)
  })

  it('a finish that published the round first makes the move lost: nothing of the move is written', async () => {
    const t = chessPass()
    const db = makeDb(t)
    spyRpc(db, (name) => {
      if (name === 'apply_scrabble_move') t.scrabble_sessions[0].phase = 'finished'
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(clockOf(t)).toBe(100_000)
    expect(t.scrabble_sessions[0].current_turn_index).toBe(0)
  })

  it('a delayed move of an earlier round cannot touch the rematch (the session version moved)', async () => {
    const t = chessPass()
    const db = makeDb(t)
    spyRpc(db, (name) => {
      if (name !== 'apply_scrabble_move') return
      // A finish AND a rematch landed after the move read the session: a new version, fresh state rows.
      t.scrabble_sessions[0].phase = 'playing'
      t.scrabble_sessions[0].updated_at = '2026-02-01T00:00:00.000Z'
      t.scrabble_player_state = t.scrabble_player_state.map((x, i) => ({
        ...x,
        id: `round2-${i}`,
        clock_ms_remaining: 300_000,
        score: 0,
      }))
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    expect(clockOf(t)).toBe(300_000)
  })

  it('an invalid answer from the move function is an error, not a clean move', async () => {
    const t = chessPass()
    const db = makeDb(t)
    const realRpc = db.supabase.rpc
    db.supabase.rpc = (name: string, args: Record<string, unknown>) =>
      name === 'apply_scrabble_move'
        ? Promise.resolve({ data: { status: 'invalid' }, error: null })
        : realRpc(name, args)
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })

  it('a delayed move whose mover left in between is lost (the leave committed a new session version first)', async () => {
    const t = chessPass()
    const db = makeDb(t)
    spyRpc(db, (name) => {
      if (name !== 'apply_scrabble_move') return
      // An active-game leave: the session is rewritten (turn order, turn, new version) BEFORE the state row is deleted.
      Object.assign(t.scrabble_sessions[0], {
        turn_order: ['B', 'C'],
        current_turn_index: 0,
        updated_at: '2026-02-01T00:00:00.000Z',
      })
      t.scrabble_player_state = t.scrabble_player_state.filter((x) => x.player_id !== 'A')
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({ skipped: true })
    // the leave's turn stands: the stale move advanced nothing
    expect(t.scrabble_sessions[0].current_turn_index).toBe(0)
    expect(t.scrabble_sessions[0].turn_order).toEqual(['B', 'C'])
  })

  it('a move for a player whose state row is gone (version unchanged) is ignored, not an error', async () => {
    const t = chessPass()
    const db = makeDb(t)
    spyRpc(db, (name) => {
      if (name === 'apply_scrabble_move')
        t.scrabble_player_state = t.scrabble_player_state.filter((x) => x.player_id !== 'A')
    })
    expect(await processScrabblePass(db.supabase, 'G', 'A')).toEqual({})
  })

  it('an exchange that ends the round ranks the NEW rack and writes it with the finish', async () => {
    const t = scrabbleTables()
    // Three seats, stalemate limit reached by this exchange.
    Object.assign(t.scrabble_sessions[0], { bag: Array.from({ length: 10 }, () => 'E'), consecutive_passes: 5 })
    t.scrabble_player_state.forEach((x) => (x.rack = ['E']))
    t.scrabble_player_state.find((x) => x.player_id === 'A')!.rack = ['Q']
    // shuffle() keeps its order for a Math.random just below 1, so the drawn tile is deterministic (the first E).
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const res = await processScrabbleExchange(makeDb(t).supabase, 'G', 'A', [0])
    random.mockRestore()
    expect(res).toEqual({})
    expect(t.scrabble_sessions[0].phase).toBe('finished')
    const a = t.scrabble_player_state.find((x) => x.player_id === 'A')!
    // A holds a freshly drawn tile (not the Q) in the published result, and was penalised for THAT rack only.
    expect(a.rack).not.toEqual(['Q'])
    // Final score = 0 minus the value of the NEW rack (E = 1), not the discarded Q (10).
    expect(a.score).toBe(-1)
    expect(t.games[0].status).toBe('finished')
  })

  it('an exchange that does not end the round writes the rack through the guarded mover write', async () => {
    const t = scrabbleTables()
    Object.assign(t.scrabble_sessions[0], { bag: Array.from({ length: 10 }, () => 'E') })
    t.scrabble_player_state.find((x) => x.player_id === 'A')!.rack = ['Q']
    // shuffle() keeps its order for a Math.random just below 1, so the drawn tile is deterministic (the first E).
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const res = await processScrabbleExchange(makeDb(t).supabase, 'G', 'A', [0])
    random.mockRestore()
    expect(res).toEqual({})
    expect(t.scrabble_player_state.find((x) => x.player_id === 'A')!.rack).toEqual(['E'])
    expect(t.scrabble_sessions[0].phase).toBe('playing')
  })

  it('the series award counts the penalty cards a missed-UNO player receives with the finish', async () => {
    const num = (id: string, color: string, value: number) => ({ id, color, kind: 'number', value })
    const t = unoTables()
    Object.assign(t.games[0], { uno_series_scoring: true, uno_series_target: 100000, uno_series_scores: {} })
    Object.assign(t.uno_sessions[0], {
      top_card: num('top', 'red', 3),
      draw_pile: [
        { id: 'w1', color: 'wild', kind: 'wild' },
        { id: 'w2', color: 'wild', kind: 'wild' },
      ],
      discard_pile: [],
      uno_pending_player: 'D',
      uno_called: false,
      last_play_player_id: 'D',
    })
    t.uno_player_hands[0].cards = [num('A1', 'red', 5)]
    t.uno_player_hands[1].cards = [num('B1', 'blue', 9)]
    t.uno_player_hands[2].cards = [num('C1', 'blue', 4)]
    t.uno_player_hands[3].cards = [num('D1', 'blue', 6)]
    expect(await processUnoPlay(makeDb(t).supabase, 'G', 'A', 'A1')).toEqual({})
    const dCards = t.uno_player_hands[3].cards as unknown[]
    if (dCards.length === 3) {
      // D drew the two wilds: 6 + 50 + 50 for D, plus 9 and 4
      expect(t.games[0].uno_series_scores).toEqual({ A: 9 + 4 + 6 + 100 })
    } else {
      throw new Error(`the missed-UNO penalty did not apply (D holds ${dCards.length} cards)`)
    }
  })
})

describe('round binding of the Scrabble host finish and expiry', () => {
  const rackless = () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    return t
  }

  it('a host finish authorized against an earlier round never finishes the later round', async () => {
    const t = rackless()
    t.games[0].sessions_played = 2
    expect(
      await finishScrabbleGameEarly(makeDb(t).supabase, 'G', {
        sessionStartedAt: '2020-01-01T00:00:00.000Z',
        sessionsPlayed: 1,
      })
    ).toEqual({
      error: null,
      skipped: true,
    })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
    // the same round still finishes
    expect(
      await finishScrabbleGameEarly(makeDb(t).supabase, 'G', {
        sessionStartedAt: '2020-01-01T00:00:00.000Z',
        sessionsPlayed: 2,
      })
    ).toEqual({ error: null })
    expect(t.scrabble_sessions[0].phase).toBe('finished')
  })

  it('an expiry for the earlier round, after a replay left the old finished session in place, is not "finished"', async () => {
    const t = rackless()
    // Play Again: the games row is back to waiting with a new round identity; the finished session row is retained.
    t.scrabble_sessions[0].phase = 'finished'
    Object.assign(t.games[0], { status: 'waiting', sessions_played: 2, session_started_at: null })
    const game = {
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      sessions_played: 1,
      game_duration_seconds: 60,
    }
    expect(await finishExpiredScrabbleGame(makeDb(t).supabase, game as never)).toEqual({ finished: false })
    expect(t.games[0].status).toBe('waiting')
  })
})

describe('Uno: optional attribution, committed timer finish, retained seats', () => {
  it('a turn expiry whose delegate ended the round on the game timer is a success, not a skip', async () => {
    const t = unoTables()
    t.uno_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'
    Object.assign(t.games[0], { session_started_at: '2999-01-01T00:00:00.000Z', game_duration_seconds: 60 })
    let loads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        // 'players' is the last read of a state load. After the expiry handler's own load, the game timer runs out.
        if (tb === 'players' && ++loads === 1) t.games[0].session_started_at = '2020-01-01T00:00:00.000Z'
      },
    })
    expect(await processUnoExpireTurn(db.supabase, 'G')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('finished')
  })

  it('a leave that retries into a published result keeps the seat (Uno)', async () => {
    const t = unoTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        // The round was published between the leave's read and its CAS.
        Object.assign(t.uno_sessions[0], { phase: 'finished', updated_at: '2026-01-01T00:00:07.000Z' })
      },
    })
    expect(await removeUnoPlayer(db.supabase, 'G', 'C', 'C')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('C')
  })

  it('a leave of a seat that is already out of the turn order of a finished round still gets its cleanup (Uno)', async () => {
    const t = unoTables()
    t.uno_sessions[0].phase = 'finished'
    t.uno_sessions[0].turn_order = ['A', 'B', 'D']
    expect(await removeUnoPlayer(makeDb(t).supabase, 'G', 'C', 'C')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).not.toContain('C')
  })

  it('a leave that retries into a published result keeps the seat (Scrabble)', async () => {
    const t = scrabbleTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        Object.assign(t.scrabble_sessions[0], { phase: 'finished', updated_at: '2026-01-01T00:00:07.000Z' })
      },
    })
    expect(await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')).toEqual({ error: null })
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.scrabble_player_state.map((x) => x.player_id)).toContain('C')
  })
})

describe('a move commits with its hand / state writes (the root of the remaining races)', () => {
  const num = (id: string, color: string, value: number) => ({ id, color, kind: 'number', value })
  const spy = (db: ReturnType<typeof makeDb>) => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const realRpc = db.supabase.rpc
    db.supabase.rpc = (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return realRpc(name, args)
    }
    return calls
  }
  const playing = () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: num('top', 'red', 3),
      draw_pile: [num('d1', 'green', 1), num('d2', 'green', 2)],
    })
    t.uno_player_hands[0].cards = [num('A1', 'red', 6), num('A2', 'blue', 9)]
    t.uno_player_hands[1].cards = [num('B1', 'blue', 9)]
    return t
  }

  it('a continuing play is ONE apply_uno_move call carrying the session patch, the mover hand and its stats', async () => {
    const t = playing()
    const db = makeDb(t)
    const calls = spy(db)
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({})
    const moves = calls.filter((c) => c.name === 'apply_uno_move')
    expect(moves).toHaveLength(1)
    const writes = moves[0].args.p_hand_writes as { player_id: string; cards?: unknown[]; stats?: object }[]
    const mover = writes.find((w) => w.player_id === 'A')!
    expect(mover.cards).toEqual([num('A2', 'blue', 9)])
    expect(mover.stats).toBeDefined()
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
    expect(t.uno_player_hands[0].cards).toEqual([num('A2', 'blue', 9)])
  })

  it('a continuing play that loses its claim writes no hand (and no stats)', async () => {
    const t = playing()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({ skipped: true })
    expect(t.uno_player_hands[0].cards).toEqual([num('A1', 'red', 6), num('A2', 'blue', 9)])
    expect(t.uno_player_hands[0].stats).toBeUndefined()
  })

  it("the next player finishing right after sees the previous move's hands: the series award counts them", async () => {
    const t = playing()
    Object.assign(t.games[0], { uno_series_scoring: true, uno_series_target: 100000, uno_series_scores: {} })
    t.uno_player_hands[1].cards = [num('B1', 'red', 4)]
    t.uno_player_hands[2].cards = []
    t.uno_player_hands[3].cards = []
    const db = makeDb(t)
    expect(await processUnoPlay(db.supabase, 'G', 'A', 'A1')).toEqual({})
    // B (next) goes out on the new version: A's hand was committed WITH that version (only the blue 9 is left).
    Object.assign(t.uno_sessions[0], { top_card: num('top', 'red', 3), current_turn_index: 1 })
    expect(await processUnoPlay(db.supabase, 'G', 'B', 'B1')).toEqual({})
    // A's committed hand (blue 9) plus the 1 + 2 missed-UNO penalty cards B's finish hands A: 12 points.
    expect(t.games[0].uno_series_scores).toEqual({ B: 12 })
  })

  const emptyDeck = (penaltyCards: { id: string; color: string; kind: string; value?: number }[]) => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      // exactly two cards: B's missed-UNO penalty consumes them
      draw_pile: penaltyCards,
      discard_pile: [],
      uno_pending_player: 'B',
      uno_called: false,
    })
    // Nobody can play the blue skip with the hands below; B (1 point) would win on the ORIGINAL hands, A (5) on the
    // penalised ones when the penalty cards are not playable.
    t.uno_player_hands[0].cards = [num('A1', 'red', 5)]
    t.uno_player_hands[1].cards = [num('B1', 'red', 1)]
    t.uno_player_hands[2].cards = [num('C1', 'red', 9)]
    t.uno_player_hands[3].cards = [num('D1', 'red', 9)]
    return t
  }

  it('the empty-deck finish ranks on the missed-UNO penalised hand and commits it with the finish', async () => {
    // nonmatching number cards: B cannot play them, B (1 + 9 + 9 = 19) falls behind A (5)
    const t = emptyDeck([num('p1', 'red', 9), num('p2', 'red', 9)])
    expect(await processUnoDraw(makeDb(t).supabase, 'G', 'A')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(t.uno_sessions[0].winner_player_id).toBe('A')
    expect((t.uno_player_hands[1].cards as unknown[]).length).toBe(3)
    expect(t.uno_sessions[0].draw_pile).toEqual([])
  })

  it('a Wild in the penalty cards is playable: the empty-deck round continues and commits the penalty hand', async () => {
    const t = emptyDeck([
      { id: 'w1', color: 'wild', kind: 'wild' },
      { id: 'w2', color: 'wild', kind: 'wild' },
    ])
    expect(await processUnoDraw(makeDb(t).supabase, 'G', 'A')).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
    expect((t.uno_player_hands[1].cards as unknown[]).length).toBe(3)
    expect(t.uno_sessions[0].draw_pile).toEqual([])
  })

  it('a Team-Up leave whose hand read fails is an error that deletes nothing', async () => {
    const t = unoTables()
    t.games[0].uno_team_mode = true
    const res = await removeUnoPlayer(
      makeDb(t, { failSelect: (tb) => tb === 'uno_player_hands' }).supabase,
      'G',
      'A',
      'A'
    )
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(t.players.map((p) => p.id)).toContain('A')
    expect(t.uno_sessions[0].phase).toBe('playing')
  })
})

describe('Scrabble moves are atomic and expiry reports a lost claim', () => {
  const standard = () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = ['E']))
    Object.assign(t.scrabble_sessions[0], {
      bag: Array.from({ length: 10 }, () => 'E'),
      turn_deadline_at: '2020-01-01T00:00:00.000Z',
    })
    return t
  }
  const raceOnce = (t: Tables) => {
    let raced = false
    return makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || raced) return
        raced = true
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
  }

  it('an expiry whose claim loses (standard clock) is skipped, not a success', async () => {
    const t = standard()
    expect(await processScrabbleExpireTurn(raceOnce(t).supabase, 'G')).toEqual({ skipped: true })
    expect(t.scrabble_sessions[0].current_turn_index).toBe(0)
    expect(await processScrabbleExpireTurn(makeDb(standard()).supabase, 'G')).toEqual({})
  })

  it('an expiry whose claim loses (chess clock) is skipped, not a success', async () => {
    const t = standard()
    t.scrabble_sessions[0].clock_mode = 'chess'
    t.scrabble_sessions[0].turn_started_at = new Date(Date.now() - 500_000).toISOString()
    t.scrabble_player_state.forEach((x) => (x.clock_ms_remaining = 1000))
    expect(await processScrabbleExpireTurn(raceOnce(t).supabase, 'G')).toEqual({ skipped: true })
    expect(t.scrabble_player_state.find((x) => x.player_id === 'A')!.timed_out).toBe(false)
  })

  it('a chess expiry that would end the round (everyone flagged) and loses its claim is skipped, nothing finished', async () => {
    const t = standard()
    t.scrabble_sessions[0].clock_mode = 'chess'
    t.scrabble_sessions[0].turn_started_at = new Date(Date.now() - 500_000).toISOString()
    t.scrabble_player_state.forEach((x) => {
      x.clock_ms_remaining = x.player_id === 'A' ? 1000 : 0
      x.timed_out = x.player_id !== 'A'
    })
    expect(await processScrabbleExpireTurn(raceOnce(t).supabase, 'G')).toEqual({ skipped: true })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
    expect(await processScrabbleExpireTurn(makeDb(t).supabase, 'G')).toEqual({})
    expect(t.scrabble_sessions[0].phase).toBe('finished')
  })

  it('a continuing exchange commits the bag, the rack and the turn together; a lost claim changes none of them', async () => {
    const t = standard()
    t.scrabble_player_state.find((x) => x.player_id === 'A')!.rack = ['Q']
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const lost = standard()
    lost.scrabble_player_state.find((x) => x.player_id === 'A')!.rack = ['Q']
    const calls: string[] = []
    const db = makeDb(t)
    const realRpc = db.supabase.rpc
    db.supabase.rpc = (name: string, args: Record<string, unknown>) => {
      calls.push(name)
      return realRpc(name, args)
    }
    expect(await processScrabbleExchange(db.supabase, 'G', 'A', [0])).toEqual({})
    expect(calls.filter((c) => c === 'apply_scrabble_move')).toHaveLength(1)
    expect(t.scrabble_player_state.find((x) => x.player_id === 'A')!.rack).toEqual(['E'])
    expect((t.scrabble_sessions[0].bag as string[]).includes('Q')).toBe(true)
    // lost claim: neither the bag nor the rack moved
    const bagBefore = JSON.stringify(lost.scrabble_sessions[0].bag)
    expect(await processScrabbleExchange(raceOnce(lost).supabase, 'G', 'A', [0])).toEqual({ skipped: true })
    random.mockRestore()
    expect(JSON.stringify(lost.scrabble_sessions[0].bag)).toBe(bagBefore)
    expect(lost.scrabble_player_state.find((x) => x.player_id === 'A')!.rack).toEqual(['Q'])
  })

  it('a pass whose player-state read fails is an error and publishes nothing; an empty tally never ends the round', async () => {
    const t = standard()
    Object.assign(t.scrabble_sessions[0], { consecutive_passes: 5 })
    const failed = await processScrabblePass(
      makeDb(t, { failSelect: (tb) => tb === 'scrabble_player_state' }).supabase,
      'G',
      'A'
    )
    expect(failed).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    t.scrabble_player_state = []
    const empty = await processScrabblePass(makeDb(t).supabase, 'G', 'A')
    expect(empty.error).toBe(INTERNAL_ERROR_MESSAGE)
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.games[0].status).toBe('active')
  })
})
