import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AYO_PIT_COUNT, processAyoResign } from './ayo'
import { processTicTacToeExpireTurn } from './tic-tac-toe'

/**
 * The CAS session write in these engines used to return a bare boolean, so a database failure read
 * as a lost race and the route answered 200 for a write that never landed.
 */
function client(tables: Record<string, unknown>, updateError?: { message: string }) {
  return {
    from(table: string) {
      const rows = tables[table]
      let isUpdate = false
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'eq']) chain[m] = () => chain
      chain.update = () => {
        isUpdate = true
        return chain
      }
      chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows) ? null : (rows ?? null), error: null })
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: isUpdate ? [] : Array.isArray(rows) ? rows : [],
          error: isUpdate ? (updateError ?? null) : null,
        })
      return chain
    },
  } as unknown as SupabaseClient
}

const ayo = {
  game_id: 'G',
  pits: Array(AYO_PIT_COUNT).fill(4),
  player_a_id: 'a',
  player_b_id: 'b',
  status: 'active',
  updated_at: '2026-01-01T00:00:00.000Z',
  a_win_streak: 0,
  b_win_streak: 0,
}
const ttt = {
  game_id: 'G',
  player_x_id: 'x',
  player_o_id: 'o',
  current_turn_mark: 'X',
  status: 'active',
  turn_deadline_at: '2020-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}
const dbError = { message: 'connection reset' }

describe('sibling engines do not swallow a failed session write', () => {
  it('ayo resign surfaces a generic error on a database failure and is a no-op on a lost claim', async () => {
    const failed = await processAyoResign(client({ ayo_sessions: ayo, players: [] }, dbError), 'G', 'a')
    expect(failed.error).toBeTruthy()
    expect(failed.error).not.toContain('connection reset')
    expect(await processAyoResign(client({ ayo_sessions: ayo, players: [] }), 'G', 'a')).toEqual({})
  })

  it('tic-tac-toe expire-turn surfaces a database failure and is a no-op on a lost claim', async () => {
    const tables = { tic_tac_toe_sessions: ttt, players: [], games: { timer_seconds: 0 } }
    const failed = await processTicTacToeExpireTurn(client(tables, dbError), 'G')
    expect(failed.error).toBeTruthy()
    expect(failed.error).not.toContain('connection reset')
    expect(await processTicTacToeExpireTurn(client(tables), 'G')).toEqual({})
  })
})
