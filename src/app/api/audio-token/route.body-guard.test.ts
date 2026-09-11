import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/audio-token reads its body INSIDE a broad try/catch, so an empty or malformed body
 * was caught and answered 500 "Failed to generate token" — a server-fault status for a client
 * fault. It is now a 400, decided before the room authorization runs.
 *
 * The catch must keep doing its old job for every OTHER error class, so this suite also pins
 * that a throw from `authorizedRoom` still surfaces as the 500 it always did.
 */

vi.mock('server-only', () => ({}))

const { authorizedRoom } = vi.hoisted(() => ({
  authorizedRoom: vi.fn(async () => null as { room: string; identity: string } | null),
}))
vi.mock('@/lib/audio-room-auth', () => ({ authorizedRoom }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  authorizedRoom.mockReset()
  authorizedRoom.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/audio-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/audio-token — request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"roomName":'],
  ])('rejects %s with 400 "Invalid or empty request body" instead of the old 500', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(authorizedRoom).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"room"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and never authorizes a room', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(authorizedRoom).not.toHaveBeenCalled()
  })

  it('still returns the pre-existing "roomName is required" 400 for a well-formed empty object', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'roomName is required' })
    expect(authorizedRoom).not.toHaveBeenCalled()
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    // Without these the handler answers its own "not set in environment variables" 500
    // before `authorizedRoom` ever runs, and this test would pass for the wrong reason.
    vi.stubEnv('LIVEKIT_API_KEY', 'test-key')
    vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret')
    authorizedRoom.mockRejectedValue(new Error('livekit exploded'))
    const res = await post('{"roomName":"lobby"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to generate token' })
    expect(authorizedRoom).toHaveBeenCalledWith('lobby', undefined)
  })
})
