import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CHESS_STARTING_FEN, processChessMove, processChessResign } from './chess'

const LOST_RACE = 'Another action already updated this turn — try again'

type Rows = Record<string, unknown>

/** Selects return canned rows; any `.update(...)` matches 0 rows (optimistic lock missed). */
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

const session = () => ({
  game_id: 'G',
  player_white_id: 'w1',
  player_black_id: 'b1',
  fen: CHESS_STARTING_FEN,
  pgn: '',
  current_turn: 'w',
  white_time_ms: null,
  black_time_ms: null,
  turn_started_at: null,
  turn_deadline_at: null,
  status: 'active',
  updated_at: '2026-01-01T00:00:00.000Z',
})

describe('chess lost optimistic-lock race', () => {
  it('move returns an error when the conditional update matches 0 rows', async () => {
    const updated: string[] = []
    const client = fakeClient({ chess_sessions: session(), players: [] }, updated)
    const res = await processChessMove(client, 'G', 'w1', { from: 'e2', to: 'e4' })
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['chess_sessions'])
  })

  it('resign returns an error and does not finish the game', async () => {
    const updated: string[] = []
    const client = fakeClient({ chess_sessions: session(), players: [] }, updated)
    const res = await processChessResign(client, 'G', 'w1')
    expect(res).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['chess_sessions'])
  })
})
