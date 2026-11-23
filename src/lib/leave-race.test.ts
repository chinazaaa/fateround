import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { removeUnoPlayer, processUnoExpireTurn, processUnoChallenge, UNO_REMOVE_CONFLICT_ERROR } from './uno'
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
  hooks: { afterSessionRead?: (table: string) => void; failSelect?: (table: string) => boolean } = {}
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
        for (const r of rows) Object.assign(r, vals)
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
