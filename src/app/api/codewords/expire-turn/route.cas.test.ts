import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'
import type { FilterCall } from '@/test-support/host-auth'

/**
 * Expiring a turn must be pinned to the exact expired turn it observed. If another request already
 * passed the turn (and the next team posted a clue) the stale request must not wipe that clue.
 */

vi.mock('server-only', () => ({}))

const EXPIRED = '2000-01-01T00:00:00.000Z'
const key = ['blue', 'blue', 'red', 'assassin']
const board = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['apple', 'banana', 'cherry', 'date'],
  key,
  revealed_indices: [] as number[],
  current_turn: 'red',
  turn_phase: 'clue',
  turn_deadline_at: EXPIRED,
  spymaster_timer_seconds: 60,
  winner: null,
}
// What the board looks like after a rival request advanced it and blue posted a clue.
const advanced = {
  ...board,
  current_turn: 'blue',
  turn_phase: 'guess',
  current_clue_word: 'fresh',
  turn_deadline_at: '2999-01-01T00:00:00.000Z',
}

let updateResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let updateFilters: readonly FilterCall[] = []
let updatePatch: unknown = null
let reread: unknown = advanced

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords' }), error: null }),
  codewords_boards: (ctx) => {
    if (ctx.op === 'update') {
      updateFilters = ctx.filterCalls
      updatePatch = ctx.payload
      return updateResult
    }
    return { data: updateResult.data === null && updatePatch !== null ? reread : board, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  updateResult = { data: { ...board, current_turn: 'blue' }, error: null }
  updateFilters = []
  updatePatch = null
  reread = advanced
})

const post = () => POST(jsonRequest('/api/codewords/expire-turn', { gameId: GAME_CODE }))

describe('POST /api/codewords/expire-turn — pinned to the observed turn', () => {
  it('writes only while the board is still on the turn whose deadline expired', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['id', 'board-1'] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['current_turn', 'red'] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['turn_phase', 'clue'] })
    expect(updateFilters).toContainEqual({ method: 'eq', args: ['turn_deadline_at', EXPIRED] })
    expect(updateFilters).toContainEqual({ method: 'is', args: ['winner', null] })
  })

  it('returns a skipped response with the current masked board when another request advanced it', async () => {
    updateResult = { data: null, error: null }
    const res = await post()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skipped).toBe(true)
    expect(json.board.current_clue_word).toBe('fresh')
    // The unrevealed key must stay masked on this branch too.
    expect(json.board.key).toEqual([null, null, null, null])
  })

  it('still maps a database error to 500', async () => {
    updateResult = { data: null, error: { message: 'boom' } }
    expect((await post()).status).toBe(500)
  })
})
