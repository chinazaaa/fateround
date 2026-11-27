import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// add_extra_bot inserts a players row, so the players_enforce_join_rules trigger can refuse it when a human
// join committed between this route's reads and the insert. That must surface as a 4xx, not a 500.

vi.mock('server-only', () => ({}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))
vi.mock('@/lib/game-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-admin')>()),
  assertHostGame: async () => ({
    error: null,
    status: 200,
    game: { game_type: 'whot', status: 'waiting', max_players: 6 },
  }),
}))

let RPC_ERROR: { code?: string; message: string } | null = null

const client = {
  from: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    }
    return chain
  },
  rpc: async () => ({ data: null, error: RPC_ERROR }),
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))

type Post = typeof import('./route').POST
let POST: Post

async function addBot() {
  return POST(
    new NextRequest('https://x.test/api/games/ABCD/bots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostToken: 'h' }),
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

beforeEach(async () => {
  POST ??= (await import('./route')).POST
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/games/[code]/bots — the trigger refuses the bot row', () => {
  it('lobby full is the room-full 400, not a 500', async () => {
    RPC_ERROR = { code: 'PJ001', message: 'players_join_lobby_full' }
    const res = await addBot()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Room is already full — remove a player first' })
  })

  it('a name taken in the meantime is a retryable 409', async () => {
    RPC_ERROR = { code: 'PJ002', message: 'players_join_name_taken' }
    const res = await addBot()
    expect(res.status).toBe(409)
  })

  it('any other RPC failure is still a 500', async () => {
    RPC_ERROR = { code: '57014', message: 'canceling statement' }
    const res = await addBot()
    expect(res.status).toBe(500)
  })
})
