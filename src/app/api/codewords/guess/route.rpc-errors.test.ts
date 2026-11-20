import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * codewords_process_guess re-validates turn / clue / allowance after taking its row lock
 * and raises GAME_OVER / NOT_YOUR_TURN / NO_CLUE / NO_GUESSES_LEFT. The route's pre-read
 * is stale under concurrency, so those must surface as 4xx, never 500.
 */

vi.mock('server-only', () => ({}))

const board = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['a', 'b', 'c', 'd'],
  key: ['blue', 'blue', 'red', 'assassin'],
  revealed_indices: [] as number[],
  current_turn: 'blue',
  current_clue_word: 'clue',
  current_clue_number: 2,
  clue_seq: 3,
  guesses_remaining: 3,
  winner: null,
}

const finish = vi.fn()
let lastRpcArgs: Record<string, unknown> | undefined
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }

const base = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords', session_started_at: 'S1' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  codewords_player_roles: () => ({ data: { team: 'blue', role: 'operative' }, error: null }),
  codewords_boards: () => ({ data: board, error: null }),
  codewords_guesses: () => ({ data: null, error: null }),
})
const supabase = {
  ...base,
  rpc: async (_fn: string, args: Record<string, unknown>) => {
    lastRpcArgs = args
    return rpcResult
  },
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/codewords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/codewords')>()),
  finishCodewordsGame: async (...args: unknown[]) => {
    finish(...args)
    return { error: null, cleanupError: null }
  },
}))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  finish.mockClear()
  rpcResult = { data: null, error: null }
})

const post = () =>
  POST(jsonRequest('/api/codewords/guess', { gameId: GAME_CODE, resumeToken: 'resume-token', cellIndex: 1 }))

describe('POST /api/codewords/guess — RPC re-check errors', () => {
  it.each([
    ['GAME_OVER', 'Game is over'],
    ['NOT_YOUR_TURN', "Not your team's turn"],
    ['NO_CLUE', 'Wait for your spymaster to give a clue'],
    ['NO_GUESSES_LEFT', 'No guesses left this turn'],
    ['ALREADY_REVEALED', 'That word is already revealed'],
  ])('maps %s to 400', async (code, message) => {
    rpcResult = { data: null, error: { message: code } }
    const res = await post()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: message })
  })

  it('maps STALE_CLUE to 409 and passes the observed clue_seq to the RPC', async () => {
    rpcResult = { data: null, error: { message: 'STALE_CLUE' } }
    const res = await post()
    expect(res.status).toBe(409)
    expect(lastRpcArgs?.p_clue_seq).toBe(3)
  })

  it('keeps unknown RPC errors as 500', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const res = await post()
    expect(res.status).toBe(500)
  })

  it('returns 200 on success', async () => {
    rpcResult = { data: [{ ...board, revealed_indices: [1], guesses_remaining: 2 }], error: null }
    const res = await post()
    expect(res.status).toBe(200)
  })

  it('finishes a won game as a single-winner flip bound to the session the guess was validated against', async () => {
    rpcResult = { data: [{ ...board, revealed_indices: [1], winner: 'blue' }], error: null }
    await post()
    expect(finish).toHaveBeenCalledWith(expect.anything(), 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
  })

  it('does not try to finish when the guess did not win', async () => {
    rpcResult = { data: [{ ...board, revealed_indices: [1] }], error: null }
    await post()
    expect(finish).not.toHaveBeenCalled()
  })
})
