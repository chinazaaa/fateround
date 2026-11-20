import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CHECKERS_STARTING_BOARD,
  processCheckersExpireTurn,
  processCheckersMove,
  processCheckersResign,
} from './checkers'
import {
  DRAUGHTS10_STARTING_BOARD,
  legalMovesForColor,
  processDraughts10ExpireTurn,
  processDraughts10Huff,
  processDraughts10Move,
  processDraughts10Resign,
} from './draughts10'
import { processChessResign } from './chess'
import { processWhotDraw, processWhotExpireTurn } from './whot'

const LOST_RACE = 'Another action already updated this turn — try again'

type Rows = Record<string, unknown>

/**
 * Fake client: selects return the canned row(s) per table; any `.update(...)` chain
 * resolves to zero matched rows, i.e. the optimistic-lock (updated_at) condition missed.
 */
function fakeClient(
  tables: Rows,
  updated: string[],
  opts: { updateError?: { message: string }; updateEqs?: Array<[string, unknown]> } = {}
) {
  return {
    from(table: string) {
      const rows = tables[table]
      let isUpdate = false
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'order']) chain[m] = () => chain
      chain.eq = (col: string, val: unknown) => {
        if (isUpdate && table.endsWith('_sessions')) opts.updateEqs?.push([col, val])
        return chain
      }
      chain.update = () => {
        isUpdate = true
        updated.push(table)
        return chain
      }
      chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows) ? null : (rows ?? null), error: null })
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: isUpdate ? [] : Array.isArray(rows) ? rows : [],
          error: isUpdate ? (opts.updateError ?? null) : null,
        })
      return chain
    },
  } as unknown as SupabaseClient
}

const checkersSession = (over: Rows = {}) => ({
  id: 's',
  game_id: 'G',
  player_red_id: 'red',
  player_black_id: 'blk',
  board: CHECKERS_STARTING_BOARD,
  current_turn: 'r',
  move_count: 0,
  position_counts: {},
  must_continue_from: null,
  red_time_ms: null,
  black_time_ms: null,
  turn_started_at: null,
  status: 'active',
  updated_at: '2026-01-01T00:00:00.000Z',
  turn_deadline_at: null,
  ...over,
})

describe('checkers lost optimistic-lock race', () => {
  it('move returns an error when the conditional update matches 0 rows', async () => {
    const updated: string[] = []
    const client = fakeClient({ checkers_sessions: checkersSession(), players: [] }, updated)
    const res = await processCheckersMove(client, 'G', 'red', { from: '52', to: '43' })
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['checkers_sessions'])
  })

  it('resign returns an error and does not finish the game', async () => {
    const updated: string[] = []
    const client = fakeClient({ checkers_sessions: checkersSession(), players: [] }, updated)
    const res = await processCheckersResign(client, 'G', 'red')
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['checkers_sessions'])
  })

  it('expire-turn is a no-op (not an error) when it loses the claim, and does not finish the game', async () => {
    const updated: string[] = []
    const client = fakeClient(
      {
        checkers_sessions: checkersSession({ turn_deadline_at: '2020-01-01T00:00:00.000Z', red_time_ms: 0 }),
        players: [],
      },
      updated
    )
    const res = await processCheckersExpireTurn(client, 'G')
    expect(res).toEqual({})
    expect(updated).toEqual(['checkers_sessions'])
  })

  it('expire-turn still surfaces a database failure', async () => {
    const client = fakeClient(
      { checkers_sessions: checkersSession({ turn_deadline_at: '2020-01-01T00:00:00.000Z' }), players: [] },
      [],
      { updateError: { message: 'connection reset' } }
    )
    const res = await processCheckersExpireTurn(client, 'G')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toContain('connection reset')
  })
})

const draughtsSession = (over: Rows = {}) => ({
  id: 's',
  game_id: 'G',
  player_red_id: 'red',
  player_black_id: 'blk',
  board: DRAUGHTS10_STARTING_BOARD,
  current_turn: 'b',
  move_count: 0,
  position_counts: {},
  must_continue_from: null,
  must_continue_remaining: null,
  huffing_enabled: false,
  huffable_squares: [],
  red_time_ms: null,
  black_time_ms: null,
  turn_started_at: null,
  status: 'active',
  updated_at: '2026-01-01T00:00:00.000Z',
  turn_deadline_at: null,
  ...over,
})

describe('draughts10 lost optimistic-lock race and database failures', () => {
  const first = legalMovesForColor(DRAUGHTS10_STARTING_BOARD, 'b')[0]
  const dbError = { message: 'connection reset' }
  const tables = (over: Rows = {}) => ({ checkers10_sessions: draughtsSession(over), players: [] })

  it('move returns the conflict (not success) when the conditional update matches 0 rows', async () => {
    const updated: string[] = []
    const res = await processDraughts10Move(fakeClient(tables(), updated), 'G', 'blk', first)
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['checkers10_sessions'])
  })

  it('resign returns the conflict (not success) when the claim is lost', async () => {
    const res = await processDraughts10Resign(fakeClient(tables(), []), 'G', 'red')
    expect(res).toEqual({ error: LOST_RACE })
  })

  it('huff returns the conflict (not success) when the claim is lost', async () => {
    // Black (to move) huffs the red man at 61 that red left un-captured.
    const res = await processDraughts10Huff(
      fakeClient(tables({ huffing_enabled: true, huffable_squares: ['61'] }), []),
      'G',
      'blk',
      '61'
    )
    expect(res).toEqual({ error: LOST_RACE })
  })

  it('expire-turn is a no-op when it loses the claim, and surfaces a database failure', async () => {
    const over = { turn_deadline_at: '2020-01-01T00:00:00.000Z', black_time_ms: 0 }
    const updated: string[] = []
    expect(await processDraughts10ExpireTurn(fakeClient(tables(over), updated), 'G')).toEqual({})
    expect(updated).toEqual(['checkers10_sessions'])
    const failed = await processDraughts10ExpireTurn(fakeClient(tables(over), [], { updateError: dbError }), 'G')
    expect(failed.error).toBeTruthy()
    expect(failed.error).not.toContain('connection reset')
  })

  it('move, resign and huff surface a database failure as a generic error, not the conflict', async () => {
    const opts = { updateError: dbError }
    const move = await processDraughts10Move(fakeClient(tables(), [], opts), 'G', 'blk', first)
    const resign = await processDraughts10Resign(fakeClient(tables(), [], opts), 'G', 'red')
    for (const res of [move, resign]) {
      expect(res.error).toBeTruthy()
      expect(res.error).not.toBe(LOST_RACE)
      expect(res.error).not.toContain('connection reset')
    }
  })
})

function whotTables(sessionOver: Rows = {}): Rows {
  return {
    whot_sessions: {
      game_id: 'G',
      phase: 'playing',
      turn_order: ['p1', 'p2'],
      current_turn_index: 0,
      draw_pile: [
        { shape: 'circle', number: 1 },
        { shape: 'square', number: 2 },
      ],
      discard_pile: [],
      top_card: { shape: 'triangle', number: 5 },
      pick_two_stack: 0,
      pick_five_stack: 0,
      reshuffle_count: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
      ...sessionOver,
    },
    whot_player_hands: [
      { game_id: 'G', player_id: 'p1', player_order: 0, cards: [{ shape: 'cross', number: 3 }] },
      { game_id: 'G', player_id: 'p2', player_order: 1, cards: [{ shape: 'star', number: 4 }] },
    ],
    games: { timer_seconds: 0, game_duration_seconds: 0, session_started_at: null },
    players: [],
  }
}

describe('database failures are not reported as a lost race', () => {
  const dbError = { message: 'connection reset' }

  it('checkers move surfaces a generic server error, not the conflict message', async () => {
    const client = fakeClient({ checkers_sessions: checkersSession(), players: [] }, [], { updateError: dbError })
    const res = await processCheckersMove(client, 'G', 'red', { from: '52', to: '43' })
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(LOST_RACE)
    expect(res.error).not.toContain('connection reset')
  })

  it('checkers resign surfaces a generic server error', async () => {
    const client = fakeClient({ checkers_sessions: checkersSession(), players: [] }, [], { updateError: dbError })
    const res = await processCheckersResign(client, 'G', 'red')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(LOST_RACE)
  })

  it('chess resign surfaces a generic server error, and a lost race still reads as a conflict', async () => {
    const session = {
      game_id: 'G',
      player_white_id: 'w',
      player_black_id: 'b',
      status: 'active',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const failing = fakeClient({ chess_sessions: session, players: [] }, [], { updateError: dbError })
    const failed = await processChessResign(failing, 'G', 'w')
    expect(failed.error).toBeTruthy()
    expect(failed.error).not.toBe(LOST_RACE)
    const lost = fakeClient({ chess_sessions: session, players: [] }, [])
    expect(await processChessResign(lost, 'G', 'w')).toEqual({ error: LOST_RACE })
  })

  it('whot draw surfaces a generic server error', async () => {
    const client = fakeClient(whotTables(), [], { updateError: dbError })
    const res = await processWhotDraw(client, 'G', 'p1')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(LOST_RACE)
  })
})

describe('session claims carry the observed version', () => {
  it('checkers move claims only the row version it read', async () => {
    const updateEqs: Array<[string, unknown]> = []
    const client = fakeClient({ checkers_sessions: checkersSession(), players: [] }, [], { updateEqs })
    await processCheckersMove(client, 'G', 'red', { from: '52', to: '43' })
    expect(updateEqs).toContainEqual(['game_id', 'G'])
    expect(updateEqs).toContainEqual(['updated_at', '2026-01-01T00:00:00.000Z'])
  })

  it('whot draw claims only the row version it read', async () => {
    const updateEqs: Array<[string, unknown]> = []
    const client = fakeClient(whotTables(), [], { updateEqs })
    await processWhotDraw(client, 'G', 'p1')
    expect(updateEqs).toContainEqual(['updated_at', '2026-01-01T00:00:00.000Z'])
  })
})

describe('whot expiry and deck exhaustion races', () => {
  const dbError = { message: 'connection reset' }

  it('maps a lost draw claim on the expiry path to skipped, not an error', async () => {
    const client = fakeClient(whotTables({ turn_deadline_at: '2020-01-01T00:00:00.000Z' }), [])
    const res = await processWhotExpireTurn(client, 'G')
    expect(res).toEqual({ skipped: true })
  })

  it('still returns the conflict for a player draw that loses the claim', async () => {
    const client = fakeClient(whotTables({ turn_deadline_at: '2020-01-01T00:00:00.000Z' }), [])
    expect(await processWhotDraw(client, 'G', 'p1')).toEqual({ error: LOST_RACE })
  })

  it('does not report success when the deck-exhaustion finish loses the race', async () => {
    const updated: string[] = []
    const client = fakeClient(whotTables({ draw_pile: [], discard_pile: [] }), updated)
    const res = await processWhotDraw(client, 'G', 'p1')
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['whot_sessions'])
  })

  it('surfaces a database error from the deck-exhaustion finish instead of the lost-race message', async () => {
    const client = fakeClient(whotTables({ draw_pile: [], discard_pile: [] }), [], { updateError: dbError })
    const res = await processWhotDraw(client, 'G', 'p1')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toBe(LOST_RACE)
  })

  it('does not map a database error from the deck-exhaustion finish to skipped on the expiry path', async () => {
    const client = fakeClient(
      whotTables({ draw_pile: [], discard_pile: [], turn_deadline_at: '2020-01-01T00:00:00.000Z' }),
      [],
      { updateError: dbError }
    )
    const res = await processWhotExpireTurn(client, 'G')
    expect(res).not.toHaveProperty('skipped')
    expect(res.error).toBeTruthy()
  })
})

describe('whot draw lost optimistic-lock race', () => {
  it('returns an error instead of success when the claim matches 0 rows', async () => {
    const updated: string[] = []
    const client = fakeClient(
      {
        whot_sessions: {
          game_id: 'G',
          phase: 'playing',
          turn_order: ['p1', 'p2'],
          current_turn_index: 0,
          draw_pile: [
            { shape: 'circle', number: 1 },
            { shape: 'square', number: 2 },
          ],
          discard_pile: [],
          top_card: { shape: 'triangle', number: 5 },
          pick_two_stack: 0,
          pick_five_stack: 0,
          reshuffle_count: 0,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        whot_player_hands: [
          { game_id: 'G', player_id: 'p1', player_order: 0, cards: [{ shape: 'cross', number: 3 }] },
          { game_id: 'G', player_id: 'p2', player_order: 1, cards: [{ shape: 'star', number: 4 }] },
        ],
        games: { timer_seconds: 0, game_duration_seconds: 0, session_started_at: null },
        players: [],
      },
      updated
    )
    const res = await processWhotDraw(client, 'G', 'p1')
    expect(res).toEqual({ error: LOST_RACE })
    // Only the session claim was attempted; no hand write followed the lost race.
    expect(updated).toEqual(['whot_sessions'])
  })
})
