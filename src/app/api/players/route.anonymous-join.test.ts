import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { anonymousPlayerCanChat } from '@/lib/anonymous-messages'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))
vi.mock('@/lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/push')>()),
  maybeNotifyHostPlayerJoined: async () => {},
}))

let GAME: Record<string, unknown> = {}
const inserts: Record<string, unknown>[] = []
const spectatorFilters: unknown[] = []

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          if (table === 'players' && col === 'spectator') spectatorFilters.push(val)
          return chain
        },
        neq: () => chain,
        ilike: () => chain,
        update: () => chain,
        maybeSingle: async () => ({ data: table === 'games' ? GAME : null, error: null }),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row)
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'p-new', gender: 'both', identity_gender: null, resume_token: 'TOK', ...row },
                error: null,
              }),
            }),
          }
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
      }
      return chain
    },
  }
}

const client = makeClient()
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => client }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))

type Post = typeof import('./route').POST
let POST: Post

async function join(body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('https://x.test/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd', ...body }),
    })
  )
}

beforeEach(async () => {
  POST ??= (await import('./route')).POST
  inserts.length = 0
  spectatorFilters.length = 0
})

describe('POST /api/players — anonymous room', () => {
  it('seats a lobby joiner as a normal participant who can chat after start', async () => {
    GAME = { id: 'ABCD', status: 'waiting', game_type: 'anonymous_messages', session_started_at: null }
    const res = await join()
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].spectator).toBe(false)
    expect(spectatorFilters).toContain(false)

    // Host starts the game after the player joined.
    const joinedAt = new Date(Date.now() - 60_000).toISOString()
    const started = { status: 'active' as const, session_started_at: new Date().toISOString() }
    expect(anonymousPlayerCanChat({ joined_at: joinedAt, spectator: inserts[0].spectator as boolean }, started)).toBe(
      true
    )
  })

  it('keeps an explicit watch-only join to a waiting room as a spectator', async () => {
    GAME = { id: 'ABCD', status: 'waiting', game_type: 'anonymous_messages', session_started_at: null }
    const res = await join({ joinAsViewer: true })
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].spectator).toBe(true)
  })

  it('seats a late joiner to an active room as a spectator who cannot chat', async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString()
    GAME = {
      id: 'ABCD',
      status: 'active',
      game_type: 'anonymous_messages',
      session_started_at: startedAt,
      allow_viewers: true,
      allow_late_players: true,
    }
    const res = await join()
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].spectator).toBe(true)
    expect(
      anonymousPlayerCanChat(
        { joined_at: new Date().toISOString(), spectator: true },
        { status: 'active', session_started_at: startedAt }
      )
    ).toBe(false)
  })
})
