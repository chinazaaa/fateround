import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/audio-presence parses its body INSIDE the broad try/catch, and `req.json()` parses a
 * literal `null` body SUCCESSFULLY — so `.catch(() => ({}))` never fires and `body` is `null`.
 * Destructuring `{ roomName, auth }` off it threw a TypeError, which this route's catch turned
 * into its best-effort 200 `{ count: 0 }` — NOT a 500. So a malformed request was reported to the
 * caller as "nobody is in the room", indistinguishable from a real empty room. A `?? {}` at the
 * parse site makes `null` behave exactly like `{}`: 400 "roomName is required".
 *
 * The catch must keep doing its old job for every OTHER error class, so this suite also pins
 * that a throw from `authorizedRoom` still resolves to the same 200 `{ count: 0 }` it always did.
 */

vi.mock('server-only', () => ({}))

const { authorizedRoom, listParticipants } = vi.hoisted(() => ({
  authorizedRoom: vi.fn(async () => null as { room: string; identity: string } | null),
  listParticipants: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/audio-room-auth', () => ({ authorizedRoom }))
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    listParticipants = listParticipants
  },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  authorizedRoom.mockReset()
  authorizedRoom.mockResolvedValue(null)
  listParticipants.mockReset()
  listParticipants.mockResolvedValue([])
  // Without these the handler short-circuits to its own 200 {count:0} before `authorizedRoom`
  // ever runs, and the interesting assertions would pass for the wrong reason.
  vi.stubEnv('LIVEKIT_API_KEY', 'test-key')
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_LIVEKIT_URL', 'wss://livekit.test.local')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(() => {
  consoleError.mockRestore()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/audio-presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

const VALID = '{"roomName":"ABCD","auth":{"kind":"host","token":"tok"}}'

describe('POST /api/audio-presence — null JSON body', () => {
  it('answers 200 with the participant count for a valid, authorized body', async () => {
    authorizedRoom.mockResolvedValue({ room: 'ABCD', identity: 'host-ABCD' })
    listParticipants.mockResolvedValue([{}, {}, {}])
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ count: 3 })
    expect(authorizedRoom).toHaveBeenCalledWith('ABCD', { kind: 'host', token: 'tok' })
    expect(listParticipants).toHaveBeenCalledWith('ABCD')
  })

  it('answers 403 for a valid body that fails authorization', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Not authorized' })
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the roomName field', '{"auth":{"kind":"host","token":"tok"}}'],
  ])('answers 400 "roomName is required" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'roomName is required' })
    expect(authorizedRoom).not.toHaveBeenCalled()
  })

  // DELIBERATE STATUS CHANGE: a null body used to be swallowed by the catch and answered
  // 200 {count:0} — a client fault indistinguishable from a genuinely empty room. It now takes
  // the same path as `{}` and answers 400 "roomName is required".
  it('answers 400 for a null body, exactly like an empty object (was 200 {count:0})', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'roomName is required' })
    expect(authorizedRoom).not.toHaveBeenCalled()
  })

  it('leaves the catch handling every other throw as a 200 {count:0}', async () => {
    authorizedRoom.mockRejectedValue(new Error('supabase exploded'))
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ count: 0 })
    expect(authorizedRoom).toHaveBeenCalledWith('ABCD', { kind: 'host', token: 'tok' })
  })
})
