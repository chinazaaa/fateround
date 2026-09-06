import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Message-inbox games (`anonymous_messages`, `secret_message`) only ever write
 * the `anonymous_messages` table — never the `games` row — so before this they
 * looked idle to `games.last_activity_at` no matter how many messages were
 * flying. A false reap there is destructive: the secret-message finish path
 * DELETES the whole inbox. This pins that sending a message counts as activity.
 */

const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))

const GAME = { id: 'ABCD', status: 'active', game_type: 'anonymous_messages', session_started_at: null }
const PLAYER = { id: 'p-1', game_id: 'ABCD', resume_token: 'TOKEN-1234', joined_at: null }

const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
const insert = vi.fn().mockResolvedValue({ error: null })

/** Minimal PostgREST-shaped stub covering the reads this route makes. */
function makeClient() {
  return {
    rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'games') return { data: GAME, error: null }
          if (table === 'players') return { data: PLAYER, error: null }
          return { data: null, error: null }
        },
        insert,
      }
      return chain
    },
  }
}

const anon = makeClient()
const admin = makeClient()
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => anon }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => admin }))
vi.mock('@/lib/anonymous-messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/anonymous-messages')>()),
  trimAnonymousMessagesIfDue: async () => {},
  anonymousPlayerCanPost: () => true,
  anonymousSessionExpired: () => false,
  isPlayerBanned: () => false,
}))

// Loaded lazily: static imports are hoisted above the stubs above, and the route
// resolves its anon client at module scope.
type Post = typeof import('./route').POST
let POST: Post

async function send(body: Record<string, unknown>) {
  return POST(
    new NextRequest('https://x.test/api/anonymous-messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

beforeEach(async () => {
  POST ??= (await import('./route')).POST
  const { resetGameActivityThrottle } = await import('@/lib/game-activity')
  rpc.mockClear()
  insert.mockClear()
  deferred.length = 0
  resetGameActivityThrottle()
})

describe('POST /api/anonymous-messages', () => {
  it('bumps game activity when a message is sent', async () => {
    const res = await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text: 'hello' })
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)

    await Promise.all(deferred.splice(0))
    expect(rpc).toHaveBeenCalledWith('touch_game_activity', expect.objectContaining({ p_game_id: 'ABCD' }))
  })

  it('only writes activity once for a burst of messages', async () => {
    for (let i = 0; i < 5; i++) {
      await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text: `hello ${i}` })
    }
    await Promise.all(deferred.splice(0))

    expect(insert).toHaveBeenCalledTimes(5)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
