import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CHECKERS_STARTING_BOARD,
  processCheckersExpireTurn,
  processCheckersMove,
  processCheckersResign,
} from './checkers'
import { processWhotDraw } from './whot'

const LOST_RACE = 'Another action already updated this turn — try again'

type Rows = Record<string, unknown>

/**
 * Fake client: selects return the canned row(s) per table; any `.update(...)` chain
 * resolves to zero matched rows, i.e. the optimistic-lock (updated_at) condition missed.
 */
function fakeClient(tables: Rows, updated: string[]) {
  return {
    from(table: string) {
      const rows = tables[table]
      let isUpdate = false
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain
      chain.update = () => {
        isUpdate = true
        updated.push(table)
        return chain
      }
      chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows) ? null : (rows ?? null), error: null })
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: isUpdate ? [] : Array.isArray(rows) ? rows : [], error: null })
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

  it('expire-turn returns an error and does not finish the game', async () => {
    const updated: string[] = []
    const client = fakeClient(
      {
        checkers_sessions: checkersSession({ turn_deadline_at: '2020-01-01T00:00:00.000Z', red_time_ms: 0 }),
        players: [],
      },
      updated
    )
    const res = await processCheckersExpireTurn(client, 'G')
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['checkers_sessions'])
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
