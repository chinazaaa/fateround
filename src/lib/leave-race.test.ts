import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  removeUnoPlayer,
  processUnoExpireTurn,
  processUnoPlay,
  processUnoPass,
  processUnoSwap,
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

function makeDb(
  tables: Tables,
  hooks: {
    afterSessionRead?: (table: string) => void
    failUpdates?: (table: string) => boolean
    failSelect?: (table: string) => boolean
    failDeletes?: (table: string) => boolean
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (t: string) => builder(t) } as any, tables }
}

const T0 = '2026-01-01T00:00:00.000Z'
const names = ['A', 'B', 'C', 'D'].map((id) => ({ id, game_id: 'G', name: id }))

function unoTables(): Tables {
  return {
    games: [{ id: 'G', timer_seconds: 0, uno_team_mode: false, status: 'active' }],
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
    expect(await processUnoExpireTurn(db.supabase, 'G')).toEqual({ skipped: true })
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
    expect(res).toEqual({ skipped: true })
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
    const res = await processUnoDraw(makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A')
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
    games: [{ id: 'G', timer_seconds: 0, status: 'active' }],
    players: names.slice(0, 3).map((p) => ({ ...p })),
    scrabble_player_state: names
      .slice(0, 3)
      .map((p) => ({ game_id: 'G', player_id: p.id, score: 0, timed_out: false })),
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
      makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase,
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
    const res = await processUnoPlay(makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A', 'A1')
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
    const res = await processUnoDraw(makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A')
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })
})

describe('processUnoDraw — empty pile: no derived write before the session write lands', () => {
  // Nobody holds a card A can match, but B can play: the draw just passes the turn.
  const emptyPileTables = () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      draw_pile: [],
      discard_pile: [],
    })
    t.uno_player_hands[1].cards = [{ id: 'B1', color: 'blue', kind: 'skip' }]
    return t
  }

  it('a lost CAS reports skipped and leaves the turn alone', async () => {
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
  })

  it('a database error reports the error', async () => {
    const t = emptyPileTables()
    const res = await processUnoDraw(makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' }).supabase, 'G', 'A')
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })

  it('still passes the turn when nothing raced', async () => {
    const t = emptyPileTables()
    expect(await processUnoDraw(makeDb(t).supabase, 'G', 'A')).toEqual({})
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
  })
})

describe('Mercy knockout — derived writes only after its own session write lands', () => {
  const swapTables = () => {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_sessions[0].phase = 'swap_target'
    const card = (id: string) => ({ id, color: 'red', kind: 'number', value: 5 })
    t.uno_player_hands[1].cards = Array.from({ length: 25 }, (_, i) => card(`B${i}`))
    return t
  }

  it('a lost knockout write is retried against the newer session and then lands', async () => {
    const t = swapTables()
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        // Read #1 is the swap's load, read #2 the knockout's first fresh read: a competing write lands after it.
        if (tb === 'uno_sessions' && ++reads === 2) t.uno_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({})
    expect((t.uno_player_hands[0].cards as unknown[]).length).toBe(0)
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBe(true)
  })

  it('a knockout that keeps losing runs none of its derived writes', async () => {
    const t = swapTables()
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb === 'uno_sessions' && ++reads >= 2) t.uno_sessions[0].updated_at = `2026-01-01T00:00:${10 + reads}.000Z`
      },
    })
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({})
    expect((t.uno_player_hands[0].cards as unknown[]).length).toBe(25)
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBeUndefined()
  })

  it('a landed knockout zeroes the hand and marks a spectator', async () => {
    const t = swapTables()
    expect(await processUnoSwap(makeDb(t).supabase, 'G', 'A', 'B')).toEqual({})
    expect((t.uno_player_hands[0].cards as unknown[]).length).toBe(0)
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBe(true)
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

describe('finish ordering and knockout write failures', () => {
  it('a finish whose games-row flip fails is reported as an error, not a clean finish', async () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], {
      top_card: { id: 't', color: 'blue', kind: 'skip' },
      draw_pile: [],
      discard_pile: [],
    })
    const res = await processUnoDraw(makeDb(t, { failUpdates: (tb) => tb === 'games' }).supabase, 'G', 'A')
    expect(res).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(t.uno_sessions[0].phase).toBe('finished')
  })

  it('a knockout write that errors runs none of its derived writes', async () => {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_sessions[0].phase = 'swap_target'
    t.uno_player_hands[1].cards = Array.from({ length: 25 }, (_, i) => ({
      id: `B${i}`,
      color: 'red',
      kind: 'number',
      value: 5,
    }))
    let sessionUpdates = 0
    // The swap's own write is update #1; the knockout's is #2.
    const db = makeDb(t, { failUpdates: (tb) => tb === 'uno_sessions' && ++sessionUpdates === 2 })
    expect(await processUnoSwap(db.supabase, 'G', 'A', 'B')).toEqual({})
    expect((t.uno_player_hands[0].cards as unknown[]).length).toBe(25)
    expect(t.players.find((p) => p.id === 'A')!.spectator).toBeUndefined()
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

  it('the finish claim itself refuses a finished session even when the version still matches', async () => {
    const t = seriesTables()
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'uno_sessions' || raced) return
        raced = true
        // A competing finisher claimed the round without changing the version token we hold.
        t.uno_sessions[0].phase = 'finished'
      },
    })
    expect(await finishExpiredUnoGame(db.supabase, game())).toEqual({ won: false })
    expect(t.games[0].uno_series_scores).toEqual({})
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

  it('a lost claim to another finisher (round finished now) is a plain success', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.forEach((x) => (x.rack = []))
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (tb) => {
        if (tb !== 'scrabble_sessions' || ++reads !== 1) return
        t.scrabble_sessions[0].phase = 'finished'
        t.scrabble_sessions[0].updated_at = '2026-01-01T00:00:07.000Z'
      },
    })
    expect(await finishScrabbleGameEarly(db.supabase, 'G')).toEqual({ error: null })
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
    const res = await finishScrabbleGameEarly(makeDb(t, { failUpdates: (tb) => tb === 'games' }).supabase, 'G')
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
      await finishExpiredScrabbleGame(makeDb(mk(), { failUpdates: (tb) => tb === 'games' }).supabase, expiredGame)
    ).toBe(false)
    const healthy = mk()
    expect(await finishExpiredScrabbleGame(makeDb(healthy).supabase, expiredGame)).toBe(true)
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
