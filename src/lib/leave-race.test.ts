import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  removeUnoPlayer,
  processUnoExpireTurn,
  processUnoPlay,
  processUnoPass,
  processUnoSwap,
  processUnoDraw,
  processUnoCall,
  finishExpiredUnoGame,
  UNO_REMOVE_CONFLICT_ERROR,
} from './uno'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'
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
  hooks: { afterSessionRead?: (table: string) => void; failUpdates?: (table: string) => boolean } = {}
) {
  function builder(table: string) {
    let op: 'select' | 'update' | 'delete' = 'select'
    let vals: Row = {}
    const filters: [string, unknown][] = []
    let selectAfter = false
    let single = false

    const exec = (): { data: unknown; error: { message: string } | null } => {
      const rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
      if (op === 'update') {
        if (hooks.failUpdates?.(table)) return { data: null, error: { message: 'boom' } }
        for (const r of rows) Object.assign(r, vals)
        return { data: selectAfter ? rows.map((r) => ({ ...r })) : null, error: null }
      }
      if (op === 'delete') {
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r))
        return { data: null, error: null }
      }
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
    expect(await finishExpiredUnoGame(bumpAfterFirstRead(t).supabase, expiredGame)).toBe(false)
    expect(t.uno_sessions[0].phase).toBe('playing')
  })

  it('finishExpiredUnoGame reports true when the finish lands', async () => {
    const t = unoTables()
    expect(await finishExpiredUnoGame(makeDb(t).supabase, expiredGame)).toBe(true)
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
})
