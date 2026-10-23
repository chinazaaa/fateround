import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

const RESUME_TOKEN = 'resume-token-abcdef123456'
const PLAYER_UUID = '33333333-3333-4333-8333-333333333333'

let playerRow: Record<string, unknown> | null = null
let targetRow: Record<string, unknown> | null = null
let assignCalls: unknown[] = []

vi.mock('server-only', () => ({}))

vi.mock('@/lib/word-rush-server', () => ({
  assignWordRushTeam: (...args: unknown[]) => {
    assignCalls.push(args)
    return Promise.resolve({})
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({
      games: () => ({ data: gameRow({ game_type: 'word_rush', status: 'waiting' }), error: null }),
      players: ({ filters }) => ({
        data: filters.resume_token ? playerRow : targetRow,
        error: null,
      }),
    }),
}))

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('./route')
  return POST(jsonRequest('/api/word-rush/team', body))
}

beforeEach(() => {
  assignCalls = []
  playerRow = { id: PLAYER_UUID, game_id: GAME_CODE.toUpperCase(), resume_token: RESUME_TOKEN, spectator: false }
  targetRow = { id: PLAYER_UUID, spectator: false }
  vi.resetModules()
})

describe('POST /api/word-rush/team', () => {
  it('lets a seated player pick a team', async () => {
    const res = await post({ gameId: GAME_CODE, resumeToken: RESUME_TOKEN, team: 1 })
    expect(res.status).toBe(200)
    expect(assignCalls).toHaveLength(1)
  })

  it('refuses a spectator picking a team for themselves', async () => {
    playerRow = { ...(playerRow as object), spectator: true }
    const res = await post({ gameId: GAME_CODE, resumeToken: RESUME_TOKEN, team: 1 })
    expect(res.status).toBe(403)
    expect(assignCalls).toHaveLength(0)
  })

  it('refuses a host assigning a spectator', async () => {
    targetRow = { id: PLAYER_UUID, spectator: true }
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, playerId: PLAYER_UUID, team: 1 })
    expect(res.status).toBe(403)
    expect(assignCalls).toHaveLength(0)
  })

  it('refuses a host assigning a player who is not in this game', async () => {
    targetRow = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, playerId: PLAYER_UUID, team: 1 })
    expect(res.status).toBe(404)
    expect(assignCalls).toHaveLength(0)
  })
})
