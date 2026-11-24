import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// Record the stored hands at the moment the post-finish bookkeeping (room points) would read them.
const finishProbe = vi.hoisted(() => ({ onFinished: null as null | (() => void) }))
vi.mock('./game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./game-finish')>()),
  markGameFinished: async () => finishProbe.onFinished?.(),
}))

import {
  removeUnoPlayer,
  processUnoExpireTurn,
  processUnoChallenge,
  processUnoChoose,
  processUnoDraw,
  processUnoPlay,
  finishExpiredUnoGame,
  processUnoTeamLeaveDecision,
  UNO_REMOVE_CONFLICT_ERROR,
} from './uno'
import { removeScrabblePlayer, SCRABBLE_REMOVE_CONFLICT_ERROR } from './scrabble'

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
    /** Runs after an update that matched at least one row landed (e.g. a finish CAS winning). */
    afterUpdate?: (table: string) => void
    failSelect?: (table: string) => boolean
    failUpdate?: (table: string) => boolean
  } = {}
) {
  function builder(table: string) {
    let op: 'select' | 'update' | 'delete' = 'select'
    let vals: Row = {}
    const filters: [string, unknown][] = []
    let selectAfter = false
    let single = false

    const exec = (): { data: unknown; error: unknown } => {
      const rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
      if (op === 'update') {
        if (hooks.failUpdate?.(table)) return { data: null, error: { message: 'boom', code: 'XX000' } }
        for (const r of rows) Object.assign(r, vals)
        if (rows.length > 0) hooks.afterUpdate?.(table)
        return { data: selectAfter ? rows.map((r) => ({ ...r })) : null, error: null }
      }
      if (op === 'delete') {
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r))
        return { data: null, error: null }
      }
      if (hooks.failSelect?.(table)) return { data: null, error: { message: 'boom', code: 'XX000' } }
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

describe('removeUnoPlayer — session lookup errors', () => {
  it('returns the lookup error instead of deleting the hand and player (first attempt)', async () => {
    const t = unoTables()
    const db = makeDb(t, { failSelect: (table) => table === 'uno_sessions' })
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(UNO_REMOVE_CONFLICT_ERROR)
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('C')
    expect(t.uno_sessions[0].turn_order).toEqual(['A', 'B', 'C', 'D'])
  })

  it('returns the lookup error when the re-read after a lost CAS fails (no dead seat left behind)', async () => {
    const t = unoTables()
    let sessionReads = 0
    const db = makeDb(t, {
      // Attempt 1 reads fine, then a competing write makes its CAS lose; attempt 2's lookup fails.
      afterSessionRead: (table) => {
        if (table === 'uno_sessions' && sessionReads === 1) t.uno_sessions[0].updated_at = '2026-01-01T00:00:09.000Z'
      },
      failSelect: (table) => table === 'uno_sessions' && ++sessionReads > 1,
    })
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(UNO_REMOVE_CONFLICT_ERROR)
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).toContain('C')
  })

  it('still cleans up when the lookup succeeds but there is no session row', async () => {
    const t = unoTables()
    t.uno_sessions = []
    const db = makeDb(t)
    const res = await removeUnoPlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.players.map((p) => p.id)).not.toContain('C')
    expect(t.uno_player_hands.map((h) => h.player_id)).not.toContain('C')
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

describe('processUnoExpireTurn — lost CAS inside the delegated auto-play', () => {
  it('returns skipped when a competing write lands after the delegated processor loaded', async () => {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.turn_deadline_at = '2020-01-01T00:00:00.000Z'
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        // Read #1 is the expire handler's load, read #2 the delegated processUnoPlay's own load.
        // The competing auto-play commits right after #2, so the delegated write loses its CAS
        // without any database error.
        if (++reads !== 2) return
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeUndefined()
    expect(res.skipped).toBe(true)
  })
})

describe('processUnoExpireTurn — auto-pass (delegated processUnoPass) write outcomes', () => {
  function idledAfterDraw() {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.turn_deadline_at = '2020-01-01T00:00:00.000Z'
    s.drawn_card_id = 'A1'
    return t
  }

  it('returns skipped when a competing write lands after the delegated pass loaded', async () => {
    const t = idledAfterDraw()
    const s = t.uno_sessions[0]
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        // Read #1 is the expire handler's load, read #2 the delegated processUnoPass's own load.
        if (++reads !== 2) return
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeUndefined()
    expect(res.skipped).toBe(true)
    // The losing pass wrote nothing.
    expect(s.drawn_card_id).toBe('A1')
    expect(s.current_turn_index).toBe(0)
  })

  it('propagates a database error from the delegated pass instead of reporting success', async () => {
    const t = idledAfterDraw()
    const db = makeDb(t, { failUpdate: (table) => table === 'uno_sessions' })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeTruthy()
    expect(res.skipped).toBeUndefined()
    expect(t.uno_sessions[0].drawn_card_id).toBe('A1')
  })

  it('keeps a database error from the delegated pass even when another write moved updated_at', async () => {
    const t = idledAfterDraw()
    const s = t.uno_sessions[0]
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions') return
        // After the delegated pass loaded (read #2), another player's UNO call bumps updated_at,
        // so the pass's own write then fails. The snapshot differs, but the failure is not a race.
        if (++reads !== 2) return
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
      failUpdate: (table) => table === 'uno_sessions',
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeTruthy()
    expect(res.skipped).toBeUndefined()
    expect(s.current_turn_index).toBe(0)
  })

  it('a winning pass still advances the turn', async () => {
    const t = idledAfterDraw()
    const db = makeDb(t)
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res).toEqual({})
    expect(t.uno_sessions[0].drawn_card_id).toBeNull()
    expect(t.uno_sessions[0].current_turn_index).toBe(1)
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

describe('processUnoChoose — lost CAS', () => {
  it('reports skipped (not success) when a competing write lands after the load', async () => {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.phase = 'choose_color'
    s.pending_wild = 'wild'
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || raced) return
        raced = true
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoChoose(db.supabase, 'G', 'A', 'red')
    expect(res.error).toBeUndefined()
    expect(res.skipped).toBe(true)
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

  it('returns the session lookup error instead of deleting the player rows', async () => {
    const t = scrabbleTables()
    const db = makeDb(t, { failSelect: (table) => table === 'scrabble_sessions' })
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeTruthy()
    expect(t.players.map((p) => p.id)).toContain('C')
    expect(t.scrabble_player_state.map((r) => r.player_id)).toContain('C')
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B', 'C'])
  })

  it('still cleans up when the lookup succeeds but there is no session row', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions = []
    const db = makeDb(t)
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.players.map((p) => p.id)).not.toContain('C')
    expect(t.scrabble_player_state.map((r) => r.player_id)).not.toContain('C')
  })

  it('ignores a departed player whose state row outlives their committed session update', async () => {
    const t = scrabbleTables()
    t.scrabble_player_state.find((r) => r.player_id === 'A')!.score = 100
    let raced = false
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'scrabble_sessions' || raced) return
        raced = true
        // A's leave commits turn_order [B, C] but has not yet deleted A's state row.
        const s = t.scrabble_sessions[0]
        s.turn_order = ['B', 'C']
        s.updated_at = '2026-01-01T00:00:01.000Z'
      },
    })
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeNull()
    expect(t.scrabble_sessions[0].phase).toBe('finished')
    expect(t.scrabble_sessions[0].winner_player_id).toBe('B')
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

describe('processUnoDraw — No Mercy deck runs out mid forced penalty', () => {
  const heavy = (id: string) => ({ id, color: 'wild', kind: 'wild' })
  const light = (id: string, value: number) => ({ id, color: 'red', kind: 'number', value })

  function noMercyTables(): Tables {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_player_hands.forEach((h, i) => {
      h.cards = [i === 0 ? light('A1', 1) : light(`${h.player_id}1`, 5)]
    })
    Object.assign(t.uno_sessions[0], {
      top_card: light('top', 3),
      draw_pile: [heavy('w1'), heavy('w2')],
      discard_pile: [],
      draw_penalty: 6,
      draw_penalty_kind: 'draw2',
      draw_stack_chain: 0,
    })
    return t
  }

  it('writes the drawn cards only after the finish wins, before room-point bookkeeping reads hands', async () => {
    const t = noMercyTables()
    const seen: number[] = []
    finishProbe.onFinished = () => {
      seen.push((t.uno_player_hands.find((h) => h.player_id === 'A')!.cards as unknown[]).length)
    }
    const db = makeDb(t)
    const res = await processUnoDraw(db.supabase, 'G', 'A')
    finishProbe.onFinished = null
    expect(res.error).toBeUndefined()
    expect(t.uno_sessions[0].phase).toBe('finished')
    // Standings were computed on the post-draw hand (A holds 1 + 2 wilds), so A no longer wins.
    expect(t.uno_sessions[0].winner_player_id).not.toBe('A')
    expect(seen).toEqual([3])
  })

  it('a lost finish race never overwrites the hands or runs bookkeeping', async () => {
    const t = noMercyTables()
    let bookkeeping = 0
    finishProbe.onFinished = () => {
      bookkeeping += 1
    }
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || ++reads !== 1) return
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoDraw(db.supabase, 'G', 'A')
    finishProbe.onFinished = null
    expect(res.skipped).toBe(true)
    expect(bookkeeping).toBe(0)
    expect((t.uno_player_hands.find((h) => h.player_id === 'A')!.cards as unknown[]).length).toBe(1)
    expect(t.uno_sessions[0].phase).toBe('playing')
  })
})

describe('processUnoExpireTurn — delegated auto-play is bound to the expired version', () => {
  it('skips (and writes nothing) when the session moved between the expiry check and the delegate load', async () => {
    const t = unoTables()
    const s = t.uno_sessions[0]
    s.turn_deadline_at = '2020-01-01T00:00:00.000Z'
    let reads = 0
    const db = makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || ++reads !== 1) return
        // Right after the expiry handler's load, an unrelated write bumps the version (A's turn is
        // otherwise untouched, so an unbound delegate would happily play A's card on the fresh version).
        s.updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeUndefined()
    expect(res.skipped).toBe(true)
    expect(s.current_turn_index).toBe(0)
    expect(t.uno_player_hands.find((h) => h.player_id === 'A')!.cards).toHaveLength(1)
  })
})

describe('round-timer finish outcome is not treated as a live round', () => {
  function expiredRound() {
    const t = unoTables()
    Object.assign(t.games[0], { session_started_at: '2020-01-01T00:00:00.000Z', game_duration_seconds: 60 })
    return t
  }

  it('a failed finish write returns the error from the play path and plays nothing', async () => {
    const t = expiredRound()
    // Fail ONLY the finish write: if the ordinary play were attempted afterwards it would be a second
    // session update (which would succeed and mask the finish error).
    let sessionUpdates = 0
    const db = makeDb(t, { failUpdate: (table) => table === 'uno_sessions' && sessionUpdates++ === 0 })
    const res = await processUnoPlay(db.supabase, 'G', 'A', 'A1')
    expect(sessionUpdates).toBe(1)
    expect(res.error).toBeTruthy()
    expect(res.error).not.toMatch(/Time's up/)
    expect(t.uno_sessions[0].current_turn_index).toBe(0)
    expect(t.uno_player_hands.find((h) => h.player_id === 'A')!.cards).toHaveLength(1)
  })

  it('a failed finish write returns the error from the expiry handler', async () => {
    const t = expiredRound()
    const db = makeDb(t, { failUpdate: (table) => table === 'uno_sessions' })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(res.error).toBeTruthy()
    expect(res.skipped).toBeUndefined()
  })

  it('a lost finish CAS stops the play (conflict) and the expiry handler skips', async () => {
    for (const run of ['play', 'expire'] as const) {
      const t = expiredRound()
      let reads = 0
      const db = makeDb(t, {
        afterSessionRead: (table) => {
          if (table !== 'uno_sessions' || ++reads !== 1) return
          t.uno_sessions[0].updated_at = '2026-01-01T00:00:05.000Z'
        },
      })
      const res =
        run === 'play'
          ? await processUnoPlay(db.supabase, 'G', 'A', 'A1')
          : await processUnoExpireTurn(db.supabase, 'G')
      // Both are conflicts (the play route maps skipped to 409), never a client error.
      expect(res.skipped).toBe(true)
      expect(res.error).toBeUndefined()
      expect(t.uno_sessions[0].current_turn_index).toBe(0)
    }
  })

  it('a successful finish still reports the round as ended', async () => {
    const t = expiredRound()
    const db = makeDb(t)
    const res = await processUnoPlay(db.supabase, 'G', 'A', 'A1')
    expect(res.error).toMatch(/Time's up/)
    expect(t.uno_sessions[0].phase).toBe('finished')
  })
})

describe('finishExpiredUnoGame — session already finished', () => {
  it('does not run a second finish (no winner rewrite, no extra session write)', async () => {
    const t = unoTables()
    Object.assign(t.uno_sessions[0], { phase: 'finished', winner_player_id: 'B' })
    const game = {
      id: 'G',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
      uno_team_mode: false,
    } as Parameters<typeof finishExpiredUnoGame>[1]
    const db = makeDb(t, { afterUpdate: () => expect.fail('a second finish wrote the session') })
    expect(await finishExpiredUnoGame(db.supabase, game)).toBe(true)
    expect(t.uno_sessions[0].winner_player_id).toBe('B')
    expect(t.uno_sessions[0].updated_at).toBe(T0)
  })
})

describe('processUnoTeamLeaveDecision — lost CAS is not success', () => {
  function teamTables() {
    const t = unoTables()
    t.games[0].uno_team_mode = true
    Object.assign(t.uno_sessions[0], { phase: 'team_leave_decision', team_decider_id: 'D' })
    return t
  }
  const bumpAfterFirstRead = (t: Tables) => {
    let reads = 0
    return makeDb(t, {
      afterSessionRead: (table) => {
        if (table !== 'uno_sessions' || ++reads !== 1) return
        t.uno_sessions[0].updated_at = '2026-01-01T00:00:05.000Z'
      },
    })
  }

  it.each(['continue', 'forfeit'] as const)(
    '%s reports skipped and commits nothing when the CAS is lost',
    async (d) => {
      const t = teamTables()
      const db = bumpAfterFirstRead(t)
      const res = await processUnoTeamLeaveDecision(db.supabase, 'G', 'D', d)
      expect(res.skipped).toBe(true)
      expect(res.error).toBeUndefined()
      expect(t.uno_sessions[0].phase).toBe('team_leave_decision')
    }
  )

  it('continue still commits when nothing raced', async () => {
    const t = teamTables()
    const res = await processUnoTeamLeaveDecision(makeDb(t).supabase, 'G', 'D', 'continue')
    expect(res).toEqual({})
    expect(t.uno_sessions[0].phase).toBe('playing')
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

describe('processUnoDraw — partial-draw finish surfaces hand-write failures', () => {
  const heavy = (id: string) => ({ id, color: 'wild', kind: 'wild' })
  const light = (id: string, value: number) => ({ id, color: 'red', kind: 'number', value })
  function noMercyTables(): Tables {
    const t = unoTables()
    t.games[0].uno_mode = 'no_mercy'
    t.uno_player_hands.forEach((h, i) => {
      h.cards = [i === 0 ? light('A1', 1) : light(`${h.player_id}1`, 5)]
    })
    Object.assign(t.uno_sessions[0], {
      top_card: light('top', 3),
      draw_pile: [heavy('w1'), heavy('w2')],
      discard_pile: [],
      draw_penalty: 6,
      draw_penalty_kind: 'draw2',
      draw_stack_chain: 0,
    })
    return t
  }
  const handLen = (t: Tables) => (t.uno_player_hands.find((h) => h.player_id === 'A')!.cards as unknown[]).length

  it('does not report success when the hand never persists', async () => {
    const t = noMercyTables()
    const db = makeDb(t, { failUpdate: (table) => table === 'uno_player_hands' })
    const res = await processUnoDraw(db.supabase, 'G', 'A')
    expect(res.error).toBeTruthy()
    expect(t.uno_sessions[0].phase).toBe('finished')
  })

  // A real active leave changes the session token before it deletes the hand, which would make the finish
  // CAS lose; the hand can only vanish without a token change once the session is already finished. So the
  // deletion lands right after the finish CAS wins and before the first hand write.
  const deleteAHandAfterFinish = (t: Tables) => {
    let done = false
    return (table: string) => {
      if (table !== 'uno_sessions' || done) return
      done = true
      t.uno_player_hands = t.uno_player_hands.filter((h) => h.player_id !== 'A')
    }
  }

  it('does not report success when the hand row is gone (zero rows updated)', async () => {
    const t = noMercyTables()
    const db = makeDb(t, { afterUpdate: deleteAHandAfterFinish(t) })
    const res = await processUnoDraw(db.supabase, 'G', 'A')
    expect(res.error).toBe('Hand not found')
    expect(t.uno_sessions[0].phase).toBe('finished')
  })

  it('an expiry-driven draw keeps its own hand-write failure instead of reporting a skip', async () => {
    const t = noMercyTables()
    t.uno_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'
    // Nothing playable, so the expiry auto-draws.
    t.uno_player_hands.find((h) => h.player_id === 'A')!.cards = [heavy('A9')]
    const db = makeDb(t, { afterUpdate: deleteAHandAfterFinish(t) })
    const res = await processUnoExpireTurn(db.supabase, 'G')
    expect(t.uno_sessions[0].phase).toBe('finished')
    expect(res.error).toBe('Hand not found')
    expect(res.skipped).toBeUndefined()
  })

  it('retries a transient hand-write failure and reports success with the hand persisted', async () => {
    const t = noMercyTables()
    let failures = 1
    const db = makeDb(t, {
      failUpdate: (table) => table === 'uno_player_hands' && failures-- > 0,
    })
    const res = await processUnoDraw(db.supabase, 'G', 'A')
    expect(res.error).toBeUndefined()
    expect(handLen(t)).toBe(3)
  })
})

describe('removeScrabblePlayer — player-state read failure', () => {
  it('stops before any write when the state read fails (no wrongful chess-clock finish)', async () => {
    const t = scrabbleTables()
    t.scrabble_sessions[0].clock_mode = 'chess'
    const db = makeDb(t, { failSelect: (table) => table === 'scrabble_player_state' })
    const res = await removeScrabblePlayer(db.supabase, 'G', 'C', 'C')
    expect(res.error).toBeTruthy()
    expect(t.scrabble_sessions[0].phase).toBe('playing')
    expect(t.scrabble_sessions[0].turn_order).toEqual(['A', 'B', 'C'])
    expect(t.players.map((p) => p.id)).toContain('C')
  })
})
