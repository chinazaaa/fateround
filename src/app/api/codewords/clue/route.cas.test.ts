import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'
import type { FilterCall } from '@/test-support/host-auth'

/**
 * Two clue requests can both read an empty clue. The clue write must be a compare-and-swap so only
 * the first one lands; a later one must not overwrite the clue and reset the guess allowance.
 */

vi.mock('server-only', () => ({}))

const board = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['apple', 'banana', 'cherry', 'date'],
  key: ['blue', 'blue', 'red', 'assassin'],
  revealed_indices: [] as number[],
  current_turn: 'blue',
  turn_phase: 'clue',
  current_clue_word: null as string | null,
  current_clue_number: null as number | null,
  operative_timer_seconds: 60,
  winner: null,
}

let updateResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let updateFilters: readonly FilterCall[] = []

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  codewords_player_roles: () => ({ data: { team: 'blue', role: 'spymaster' }, error: null }),
  codewords_boards: (ctx) => {
    if (ctx.op === 'update') {
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
  updateResult = { data: { ...board, current_clue_word: 'fruit', current_clue_number: 2 }, error: null }
  updateFilters = []
})

const post = () =>
  POST(
    jsonRequest('/api/codewords/clue', {
      gameId: GAME_CODE,
      resumeToken: 'resume-token',
      clueWord: 'fruit',
      clueNumber: 2,
    })
  )

describe('POST /api/codewords/clue — atomic clue post', () => {
  it('writes the clue only while the board is still waiting for one', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(updateFilters).toContainEqual({ method: 'is', args: ['current_clue_word', null] })
    expect(updateFilters).toContainEqual({ method: 'is', args: ['winner', null] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['current_turn', 'blue'] })
  })

  it('answers 409 when another request already posted the clue (no row matched)', async () => {
    updateResult = { data: null, error: null }
    const res = await post()
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'A clue was already given this turn' })
  })

  it('still maps a database error to 500', async () => {
    updateResult = { data: null, error: { message: 'boom' } }
    expect((await post()).status).toBe(500)
  })
})
