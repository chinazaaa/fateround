import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/spotify/login parses its body INSIDE the broad try/catch, and `req.json()` parses a
 * literal `null` body SUCCESSFULLY — so `.catch(() => ({}))` never fires and `body` is `null`.
 * `Object.entries(null)` then threw a TypeError which the try swallowed into the generic 500 from
 * `internalErrorMessage('spotify/login', ...)` — a server-fault status for a client fault. A `?? {}`
 * at the parse site makes `null` behave exactly like `{}` (403, no authorization granted).
 *
 * `internalErrorMessage` is NOT mocked: the real implementation logs and returns its `fallback`
 * verbatim, so the pinned string is the one production returns. `musicAuthFromParams` is also
 * real — only the network/crypto-touching helpers are stubbed.
 *
 * The catch must keep doing its old job for every OTHER error class, so this suite also pins
 * that a throw from `authorizedMusicIdentity` still surfaces as the 500 it always did.
 */

vi.mock('server-only', () => ({}))

const {
  authorizedMusicIdentity,
  buildAuthorizeUrl,
  codeChallengeFor,
  generateCodeVerifier,
  randomState,
  signHandshake,
} = vi.hoisted(() => ({
  authorizedMusicIdentity: vi.fn(async () => null as string | null),
  buildAuthorizeUrl: vi.fn(
    (state: string, challenge: string) => `https://accounts.spotify.com/authorize?s=${state}&c=${challenge}`
  ),
  codeChallengeFor: vi.fn(async (_verifier: string) => 'challenge'),
  generateCodeVerifier: vi.fn(() => 'verifier'),
  randomState: vi.fn(() => 'state'),
  signHandshake: vi.fn(async () => 'signed-handshake'),
}))

vi.mock('@/lib/music-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/music-auth')>()),
  authorizedMusicIdentity,
}))
vi.mock('@/lib/spotify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spotify')>()),
  buildAuthorizeUrl,
  codeChallengeFor,
  generateCodeVerifier,
  randomState,
  signHandshake,
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
})

afterAll(() => {
  consoleError.mockRestore()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/spotify/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

const VALID = '{"gameCode":"ABCD","role":"host","token":"tok","returnTo":"/game/ABCD"}'

describe('POST /api/spotify/login — null JSON body', () => {
  it('answers 200 with an authorize URL for a valid, authorized body', async () => {
    authorizedMusicIdentity.mockResolvedValue('host-ABCD')
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      authorizeUrl: 'https://accounts.spotify.com/authorize?s=state&c=challenge',
    })
    expect(res.cookies.get('spotify_oauth')?.value).toBe('signed-handshake')
    expect(authorizedMusicIdentity).toHaveBeenCalledWith({ kind: 'host', gameCode: 'ABCD', hostToken: 'tok' })
    expect(signHandshake).toHaveBeenCalledWith({
      verifier: 'verifier',
      state: 'state',
      identity: 'host-ABCD',
      returnTo: '/game/ABCD',
    })
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the gameCode field', '{"role":"host","token":"tok"}'],
  ])('answers 403 for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Not authorized to connect Spotify for this game' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith(null)
  })

  it('answers 403 for a null body, exactly like an empty object (was 500 "Could not start Spotify login")', async () => {
    const res = await post('null')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Not authorized to connect Spotify for this game' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith(null)
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    authorizedMusicIdentity.mockRejectedValue(new Error('supabase exploded'))
    const res = await post(VALID)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Could not start Spotify login' })
    expect(authorizedMusicIdentity).toHaveBeenCalledWith({ kind: 'host', gameCode: 'ABCD', hostToken: 'tok' })
  })
})
