import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_MAX_WORD_LENGTH,
  WORD_GROUPING_TOTAL_GROUPS,
} from '@/lib/word-grouping'

type Row = Record<string, unknown>

const SOLUTION = {
  groups: [
    { category: 'A', words: ['a1', 'a2', 'a3', 'a4'], difficulty: 1 },
    { category: 'B', words: ['b1', 'b2', 'b3', 'b4'], difficulty: 2 },
    { category: 'C', words: ['c1', 'c2', 'c3', 'c4'], difficulty: 3 },
    { category: 'D', words: ['d1', 'd2', 'd3', 'd4'], difficulty: 4 },
  ],
}

let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let allSubs: Row[] = []
const rpc = vi.fn(async () => rpcResult)
const { markGameFinished } = vi.hoisted(() => ({
  markGameFinished: vi.fn(
    async (..._args: unknown[]): Promise<{ error: string | null; won: boolean }> => ({ error: null, won: true })
  ),
}))

function table(name: string) {
  const rows = (): Row[] => {
    if (name === 'games')
      return [{ id: 'ABCD', status: 'active', session_started_at: '2026-01-01T00:00:00Z', game_duration_seconds: 0 }]
    if (name === 'rounds') return [{ id: 'r1', word_grouping_metadata: {} }]
    if (name === 'word_grouping_solutions') return [{ round_id: 'r1', solution: SOLUTION }]
    if (name === 'players') return [{ id: 'p1', game_id: 'ABCD', spectator: false }]
    if (name === 'word_grouping_submissions') return allSubs
    return []
  }
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: table, rpc }) }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: { id: 'p1', spectator: false } }) }))
vi.mock('@/lib/game-finish', () => ({ markGameFinished }))

import { POST } from './route'

const send = (words: string[]) =>
  POST(
    new NextRequest('https://x.test/api/word-grouping/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', words }),
    })
  )

const wrong = ['a1', 'b1', 'c1', 'x1']
const ok = (correct: number, mistakes: number) => ({
  data: { status: 'ok', correct_count: correct, mistake_count: mistakes },
  error: null,
})

describe('POST /api/word-grouping/submit', () => {
  beforeEach(() => {
    rpc.mockClear()
    markGameFinished.mockClear()
    allSubs = []
    rpcResult = ok(0, 1)
  })

  it('hands the limit check and the insert to the database function', async () => {
    const res = await send(wrong)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('word_grouping_submit', {
      p_game_id: 'ABCD',
      p_round_id: 'r1',
      p_player_id: 'p1',
      p_group_index: -1,
      p_difficulty: 0,
      p_guess_words: wrong,
      p_is_correct: false,
      p_max_mistakes: WORD_GROUPING_MAX_MISTAKES,
    })
    expect((await res.clone().json()).isCorrect).toBe(false)
  })

  it('sends the matched group for a correct guess', async () => {
    rpcResult = ok(1, 0)
    const res = await send(['b1', 'b2', 'b3', 'b4'])
    expect(res.status).toBe(200)
    expect((await res.json()).isCorrect).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'word_grouping_submit',
      expect.objectContaining({ p_group_index: 1, p_difficulty: 2, p_is_correct: true })
    )
  })

  it('refuses a guess the database says is past the limit', async () => {
    rpcResult = {
      data: { status: 'out_of_guesses', correct_count: 0, mistake_count: WORD_GROUPING_MAX_MISTAKES },
      error: null,
    }
    const res = await send(wrong)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Out of guesses' })
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('reports a repeated correct group as already solved', async () => {
    rpcResult = { data: { status: 'already_solved', correct_count: 1, mistake_count: 0 }, error: null }
    const res = await send(['a1', 'a2', 'a3', 'a4'])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, isCorrect: true, alreadySolved: true })
  })

  it('rejects a guess once the game is no longer active', async () => {
    rpcResult = { data: { status: 'game_not_active' }, error: null }
    const res = await send(wrong)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Game is not active' })
  })

  it('returns 500 and does not finish the game when the database call fails', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const res = await send(wrong)
    expect(res.status).toBe(500)
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('returns 500 for an unrecognised database result', async () => {
    rpcResult = { data: { status: 'nope' }, error: null }
    expect((await send(wrong)).status).toBe(500)
  })

  it('finishes the game when the admitted guess fills the last mistake slot', async () => {
    // Completion comes from the committed post-insert count, not a pre-insert read.
    rpcResult = ok(0, WORD_GROUPING_MAX_MISTAKES)
    allSubs = Array.from({ length: WORD_GROUPING_MAX_MISTAKES }, () => ({ player_id: 'p1', is_correct: false }))
    expect((await send(wrong)).status).toBe(200)
    expect(markGameFinished).toHaveBeenCalledTimes(1)
  })

  it('finishes the game when the last group is solved', async () => {
    rpcResult = ok(WORD_GROUPING_TOTAL_GROUPS, 0)
    allSubs = Array.from({ length: WORD_GROUPING_TOTAL_GROUPS }, () => ({ player_id: 'p1', is_correct: true }))
    expect((await send(['d1', 'd2', 'd3', 'd4'])).status).toBe(200)
    expect(markGameFinished).toHaveBeenCalledTimes(1)
  })

  it('does not finish the game while the player still has guesses left', async () => {
    rpcResult = ok(0, 1)
    allSubs = [{ player_id: 'p1', is_correct: false }]
    expect((await send(wrong)).status).toBe(200)
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('rejects an oversized word instead of storing it', async () => {
    const res = await send(['a1', 'a2', 'a3', 'x'.repeat(300_000)])
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a tile exactly at the shared length limit and rejects one over it', async () => {
    const tile = 'x'.repeat(WORD_GROUPING_MAX_WORD_LENGTH)
    expect((await send(['a1', 'a2', 'a3', tile])).status).toBe(200)
    rpc.mockClear()
    expect((await send(['a1', 'a2', 'a3', tile + 'x'])).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the final guess committed but finishing the game failed', async () => {
    rpcResult = ok(0, WORD_GROUPING_MAX_MISTAKES)
    allSubs = Array.from({ length: WORD_GROUPING_MAX_MISTAKES }, () => ({ player_id: 'p1', is_correct: false }))
    markGameFinished.mockResolvedValueOnce({ error: 'db down', won: false })
    expect((await send(wrong)).status).toBe(500)
    markGameFinished.mockRejectedValueOnce(new Error('thrown'))
    expect((await send(wrong)).status).toBe(500)
  })

  it('retries the finish on a repeat request when the player is already out of guesses', async () => {
    rpcResult = {
      data: { status: 'out_of_guesses', correct_count: 0, mistake_count: WORD_GROUPING_MAX_MISTAKES },
      error: null,
    }
    allSubs = Array.from({ length: WORD_GROUPING_MAX_MISTAKES }, () => ({ player_id: 'p1', is_correct: false }))
    const res = await send(wrong)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Out of guesses' })
    expect(markGameFinished).toHaveBeenCalledTimes(1)
    expect(markGameFinished).toHaveBeenCalledWith(expect.anything(), 'ABCD', expect.any(String), {
      onlyIfActive: true,
      onlySessionStartedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('retries the finish on already_solved when the player completed every group', async () => {
    rpcResult = {
      data: { status: 'already_solved', correct_count: WORD_GROUPING_TOTAL_GROUPS, mistake_count: 0 },
      error: null,
    }
    allSubs = Array.from({ length: WORD_GROUPING_TOTAL_GROUPS }, () => ({ player_id: 'p1', is_correct: true }))
    expect((await send(['a1', 'a2', 'a3', 'a4'])).status).toBe(200)
    expect(markGameFinished).toHaveBeenCalledTimes(1)
  })

  it('does not finish on already_solved while the player still has groups left', async () => {
    rpcResult = { data: { status: 'already_solved', correct_count: 1, mistake_count: 0 }, error: null }
    await send(['a1', 'a2', 'a3', 'a4'])
    expect(markGameFinished).not.toHaveBeenCalled()
  })
})
