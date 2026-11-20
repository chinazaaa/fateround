import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = null
let gameError: { message: string } | null = null
const settle = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => makeSupabaseStub({ games: () => ({ data: game, error: gameError }) }),
}))
vi.mock('@/lib/word-grouping-completion', () => ({
  settleWordGroupingGame: (...args: unknown[]) => settle(...args),
}))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ game_type: 'word_grouping', status: 'active' })
  gameError = null
  settle.mockReset()
  settle.mockResolvedValue({ finished: true })
})

const post = () => POST(jsonRequest('/api/word-grouping/complete', { gameId: GAME_CODE }))

describe('POST /api/word-grouping/complete', () => {
  it('settles the game and reports whether it finished', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, finished: true })
    expect(settle).toHaveBeenCalledWith(expect.anything(), 'ABCD')
  })

  it('reports "not finished" without error while players are still going', async () => {
    settle.mockResolvedValue({ finished: false })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, finished: false })
  })

  it('404s an unknown game and 400s another game type without settling anything', async () => {
    game = null
    expect((await post()).status).toBe(404)
    game = gameRow({ game_type: 'chess', status: 'active' })
    expect((await post()).status).toBe(400)
    expect(settle).not.toHaveBeenCalled()
  })

  it('answers 500 when settling fails, so the client keeps asking', async () => {
    settle.mockResolvedValue({ finished: false, error: new Error('markGameFinished failed: db down') })
    expect((await post()).status).toBe(500)
  })

  it('answers 500 (retryable), not a permanent 404, when the game lookup itself fails', async () => {
    game = null
    gameError = { message: 'connection reset' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).not.toEqual({ error: 'Game not found' })
    expect(settle).not.toHaveBeenCalled()
  })
})
