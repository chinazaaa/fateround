import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'
import type { FilterCall } from '@/test-support/host-auth'

/**
 * End-turn must only end the clue the operative acted on. A later turn on the same board row (the
 * other team's fresh clue) must not be wiped by a stale end-turn request.
 */

vi.mock('server-only', () => ({}))

const board = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['apple', 'banana', 'cherry', 'date'],
  key: ['blue', 'blue', 'red', 'assassin'],
  revealed_indices: [] as number[],
  current_turn: 'red',
  turn_phase: 'guess',
  current_clue_word: 'fruit' as string | null,
  current_clue_number: 2,
  clue_seq: 4,
  spymaster_timer_seconds: 60,
  winner: null,
}

let updateResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let updateFilters: readonly FilterCall[] = []
let updates = 0

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  codewords_player_roles: () => ({ data: { team: 'red', role: 'operative' }, error: null }),
  codewords_boards: (ctx) => {
    if (ctx.op === 'update') {
      updates += 1
      updateFilters = ctx.filterCalls
      return updateResult
    }
    return { data: board, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  updateResult = { data: { ...board, current_turn: 'blue', current_clue_word: null, key: board.key }, error: null }
  updateFilters = []
  updates = 0
})

const post = () => POST(jsonRequest('/api/codewords/end-turn', { gameId: GAME_CODE, resumeToken: 'resume-token' }))

describe('POST /api/codewords/end-turn — only ends the observed clue', () => {
  it('writes only while the same team still holds the same active clue', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['id', 'board-1'] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['current_turn', 'red'] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['clue_seq', 4] })
    expect(updateFilters).toContainEqual({ method: 'is', args: ['winner', null] })
    expect(updateFilters).toContainEqual({ method: 'not', args: ['current_clue_word', 'is', null] })
  })

  it('answers 409 and masks nothing when the turn moved on (no row matched)', async () => {
    updateResult = { data: null, error: null }
    const res = await post()
    expect(res.status).toBe(409)
    expect(updates).toBe(1)
    const json = await res.json()
    expect(json).not.toHaveProperty('board')
  })

  it('still maps a database error to 500', async () => {
    updateResult = { data: null, error: { message: 'boom' } }
    expect((await post()).status).toBe(500)
  })
})
