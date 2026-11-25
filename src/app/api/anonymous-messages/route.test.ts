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

// `server-only` is a Next runtime guard, not an npm package — it isn't resolvable under Vitest.
vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', game_type: 'anonymous_messages', session_started_at: null }
const PLAYER = { id: 'p-1', game_id: 'ABCD', resume_token: 'TOKEN-1234', joined_at: null }

// The insert is an rpc (it re-checks the game status under a lock); `insert` records its arguments.
const insertResult = vi.hoisted(() => ({ value: { data: { status: 'inserted' }, error: null } as unknown }))
const insert = vi.fn()
const rpc = vi.fn(async (name: string, args: unknown) => {
  if (name === 'insert_anonymous_message_if_active') {
    insert(args)
    return insertResult.value
  }
  return { data: true, error: null }
})
const activityCalls = () => rpc.mock.calls.filter(([name]) => name === 'touch_game_activity')

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
  insertResult.value = { data: { status: 'inserted' }, error: null }
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
    expect(activityCalls()).toHaveLength(1)
  })
  it('rejects mediaUrl on a text message', async () => {
    const res = await send({
      gameId: 'abcd',
      resumeToken: PLAYER.resume_token,
      text: 'hi',
      mediaUrl: 'https://tracker.example/p.gif',
    })
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects non-https gif URLs', async () => {
    for (const mediaUrl of ['javascript:alert(1)', 'http://media.example/a.gif', 'data:image/gif;base64,AAAA']) {
      const res = await send({
        gameId: 'abcd',
        resumeToken: PLAYER.resume_token,
        messageType: 'gif',
        mediaUrl,
      })
      expect(res.status).toBe(400)
    }
    expect(insert).not.toHaveBeenCalled()
  })

  it('still accepts an https gif', async () => {
    const res = await send({
      gameId: 'abcd',
      resumeToken: PLAYER.resume_token,
      messageType: 'gif',
      mediaUrl: 'https://static.klipy.com/a.gif',
    })
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('treats a zero-width-only message as empty', async () => {
    for (const text of ['\u200B', '\u200B\u200C\u200D\u2060\uFEFF', ' \u200B ', '\u061C', '\u2066\u2067\u2068\u2069']) {
      const res = await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text })
      expect(res.status).toBe(400)
    }
    expect(insert).not.toHaveBeenCalled()
  })

  it('keeps emoji ZWJ sequences intact', async () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    const res = await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text: family })
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ p_text: family }))
  })

  it('rejects a message when the game finished between the status check and the insert (decided in the database)', async () => {
    insertResult.value = { data: { status: 'game_not_active' }, error: null }
    const res = await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text: 'late' })
    expect(res.status).toBe(400)
  })

  it('surfaces a failed insert as a 500', async () => {
    insertResult.value = { data: null, error: { message: 'boom' } }
    const res = await send({ gameId: 'abcd', resumeToken: PLAYER.resume_token, text: 'x' })
    expect(res.status).toBe(500)
  })
})
