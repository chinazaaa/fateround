import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('server-only', () => ({}))

const { rateLimit } = vi.hoisted(() => ({ rateLimit: vi.fn(async (): Promise<Response | null> => null) }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, enforceRateLimit: rateLimit }
})

let game: Record<string, unknown> | null = null
const selects: unknown[] = []

// The stored rows include player_id on purpose: the route must never return it.
const rows = [
  {
    id: 'm2',
    game_id: 'ABCD',
    player_id: 'p-2',
    text: 'second',
    created_at: '2026-01-02T00:00:00Z',
    message_type: 'text',
    media_url: null,
  },
  {
    id: 'm1',
    game_id: 'ABCD',
    player_id: 'p-1',
    text: 'first',
    created_at: '2026-01-01T00:00:00Z',
    message_type: 'text',
    media_url: null,
  },
]

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  anonymous_messages: ({ selects: s }) => {
    selects.push(...s)
    return { data: rows.map((r) => ({ ...r })), error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'secret_message' })
  selects.length = 0
  rateLimit.mockReset()
  rateLimit.mockResolvedValue(null)
})

const call = (body: unknown) => POST(jsonRequest('/api/anonymous-messages/list', body))
const valid = (o: Record<string, unknown> = {}) => ({ gameId: GAME_CODE, hostToken: HOST_TOKEN, ...o })

describe('POST /api/anonymous-messages/list', () => {
  it('rejects a missing hostToken', async () => {
    const res = await call({ gameId: GAME_CODE })
    expect(res.status).toBe(400)
  })

  it('returns the limiter response before touching the database when rate limited', async () => {
    rateLimit.mockResolvedValue(new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }))
    game = null // would 404 if the route got as far as the lookup
    const res = await call(valid())
    expect(res.status).toBe(429)
    expect(selects).toHaveLength(0)
  })

  it('rejects a wrong hostToken with 403', async () => {
    const res = await call(valid({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
  })

  it('404s for an unknown game', async () => {
    game = null
    const res = await call(valid())
    expect(res.status).toBe(404)
  })

  it('rejects other game types', async () => {
    for (const t of ['anonymous_messages', 'trivia']) {
      game = gameRow({ status: 'active', game_type: t })
      const res = await call(valid())
      expect(res.status).toBe(400)
    }
  })

  it('returns messages oldest-first with no sender identity', async () => {
    const res = await call(valid())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2'])
    for (const m of json.messages) {
      expect(m).not.toHaveProperty('player_id')
      expect(m).not.toHaveProperty('player_name')
    }
    expect(JSON.stringify(json)).not.toContain('p-1')
    expect(selects.join(',')).not.toContain('player_id')
    expect(selects).not.toContain('*')
  })
})
