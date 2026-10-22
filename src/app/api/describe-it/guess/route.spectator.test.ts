import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

const RESUME_TOKEN = 'resume-token-abcdef123456'
const PLAYER_UUID = '22222222-2222-4222-8222-222222222222'

let playerRow: Record<string, unknown> | null = null
let processCalls: unknown[] = []

vi.mock('server-only', () => ({}))

vi.mock('@/lib/describe-it', () => ({
  processDescribeItGuess: (...args: unknown[]) => {
    processCalls.push(args)
    return Promise.resolve({ correct: true })
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({
      games: () => ({ data: gameRow({ game_type: 'describe_it', status: 'active' }), error: null }),
      players: () => ({ data: playerRow, error: null }),
    }),
}))

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('./route')
  return POST(jsonRequest('/api/describe-it/guess', body))
}

beforeEach(() => {
  processCalls = []
  playerRow = { id: PLAYER_UUID, game_id: GAME_CODE.toUpperCase(), resume_token: RESUME_TOKEN, spectator: false }
  vi.resetModules()
})

describe('POST /api/describe-it/guess rejects spectators', () => {
  it('lets a seated player guess', async () => {
    const res = await post({ gameId: GAME_CODE, resumeToken: RESUME_TOKEN, text: 'lagos' })
    expect(res.status).toBe(200)
    expect(processCalls).toHaveLength(1)
  })

  it('refuses a spectator with 403 and never reaches the scorer', async () => {
    playerRow = { ...(playerRow as object), spectator: true }
    const res = await post({ gameId: GAME_CODE, resumeToken: RESUME_TOKEN, text: 'lagos' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Spectators cannot play' })
    expect(processCalls).toHaveLength(0)
  })
})
