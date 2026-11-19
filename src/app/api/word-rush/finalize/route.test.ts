import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = null
const resume = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => makeSupabaseStub({ games: () => ({ data: game, error: null }) }),
}))
vi.mock('@/lib/word-rush-server', () => ({
  resumeWordRushFinalization: (...args: unknown[]) => resume(...args),
}))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ game_type: 'word_rush', status: 'active' })
  resume.mockReset()
  resume.mockResolvedValue({ resumed: true })
})

const post = () => POST(jsonRequest('/api/word-rush/finalize', { gameId: GAME_CODE }))

describe('POST /api/word-rush/finalize', () => {
  it('resumes the pending finalization of an active game', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, resumed: true })
    expect(resume).toHaveBeenCalledWith(expect.anything(), 'ABCD')
  })

  it('still resumes when the game is already finished (the marker can outlive the game finish)', async () => {
    game = gameRow({ game_type: 'word_rush', status: 'finished' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('reports nothing owed as a normal success', async () => {
    resume.mockResolvedValue({ resumed: false })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, resumed: false })
  })

  it('404s an unknown game and 400s a different game type without resuming anything', async () => {
    game = null
    expect((await post()).status).toBe(404)
    game = gameRow({ game_type: 'chess', status: 'active' })
    expect((await post()).status).toBe(400)
    expect(resume).not.toHaveBeenCalled()
  })

  it('maps a failed resume to 500 so the client keeps asking', async () => {
    resume.mockResolvedValue({ resumed: false, error: 'Something went wrong', internal: true })
    const res = await post()
    expect(res.status).toBe(500)
  })
})
