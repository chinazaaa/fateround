import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/spotify/token parses its body INSIDE the broad try/catch, and `req.json()` parses a
 * literal `null` body SUCCESSFULLY — so `.catch(() => ({}))` never fires and `body` is `null`.
 * Reading `body.auth` then threw a TypeError which the try swallowed into the generic 500 from
 * `internalErrorMessage('spotify/token', ...)` — a server-fault status for a client fault. A `?? {}`
 * at the parse site makes `null` behave exactly like `{}` (403, no authorization granted).
 *
 * `internalErrorMessage` is NOT mocked: the real implementation logs and returns its `fallback`
 * verbatim, so the pinned string is the one production returns.
 *
 * The catch must keep doing its old job for every OTHER error class, so this suite also pins
 * that a throw from `authorizedMusicIdentity` still surfaces as the 500 it always did.
 */

vi.mock('server-only', () => ({}))

const { authorizedMusicIdentity, getFreshAccessToken } = vi.hoisted(() => ({
  authorizedMusicIdentity: vi.fn(async () => null as string | null),
  getFreshAccessToken: vi.fn(
    async () => null as { accessToken: string; expiresAt: string; product: string | null } | null
  ),
}))

vi.mock('@/lib/music-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/music-auth')>()),
  authorizedMusicIdentity,
}))
vi.mock('@/lib/spotify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spotify')>()),
  getFreshAccessToken,
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  authorizedMusicIdentity.mockReset()
  authorizedMusicIdentity.mockResolvedValue(null)
  getFreshAccessToken.mockReset()
  getFreshAccessToken.mockResolvedValue(null)
})

afterAll(() => {
  consoleError.mockRestore()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/spotify/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

const VALID = '{"auth":{"kind":"host","gameCode":"ABCD","hostToken":"tok"}}'

describe('POST /api/spotify/token — null JSON body', () => {
  it('answers 200 with the fresh token for a valid, authorized body', async () => {
    authorizedMusicIdentity.mockResolvedValue('host-ABCD')
    getFreshAccessToken.mockResolvedValue({
      accessToken: 'at',
      expiresAt: '2026-01-01T00:00:00.000Z',
      product: 'premium',
    })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      accessToken: 'at',
      expiresAt: '2026-01-01T00:00:00.000Z',
      product: 'premium',
    })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith({ kind: 'host', gameCode: 'ABCD', hostToken: 'tok' })
  })

  it('answers 404 not_connected for a valid, authorized body with no stored account', async () => {
    authorizedMusicIdentity.mockResolvedValue('host-ABCD')
    const res = await post(VALID)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'not_connected' })
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the auth field', '{"other":1}'],
  ])('answers 403 for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Not authorized for this Spotify connection' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith(undefined)
  })

  it('answers 403 for a null body, exactly like an empty object (was 500 "Could not get a Spotify token")', async () => {
    const res = await post('null')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Not authorized for this Spotify connection' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith(undefined)
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    authorizedMusicIdentity.mockRejectedValue(new Error('supabase exploded'))
    const res = await post(VALID)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Could not get a Spotify token' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith({ kind: 'host', gameCode: 'ABCD', hostToken: 'tok' })
  })
})
