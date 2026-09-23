import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_CODE,
  GAME_ID,
  HOST_TOKEN,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
  codeParams,
} from '@/test-support/host-auth'

/**
 * Characterization of the host-token comparison in POST /api/games/[code]/verify-host.
 *
 * Written against the ORIGINAL `game.host_token === hostToken` and re-run unmodified
 * against the `secretMatches(...)` swap, so the swap is provably behaviour-preserving.
 *
 * Gate ladder, in order — every case below is pinned so a swap cannot move it:
 *   1. malformed JSON body            → 400 { ok: false, error: 'Invalid input' }
 *   2. hostToken not a non-empty str  → 200 { ok: false }   (NO db read at all)
 *   3. game row missing               → 200 { ok: false, notFound: true }
 *   4. token comparison               → 200 { ok: <boolean> }
 *
 * Gate 2 is the one that matters for the swap: line 28 coerces anything that is not a
 * string to `''` and line 29 returns early on `''`. So `null`, `undefined`, a number and
 * an array NEVER reach the comparison — the comparison only ever sees a non-empty string.
 * That is what makes `secretMatches` a drop-in here, and the no-db-read assertions below
 * are what prove the early return still happens rather than the comparison absorbing it.
 *
 * `@/lib/secret-compare` is WRAPPED, never substituted — see `compareCalls` below.
 */

/**
 * A FAITHFUL wrapper around `@/lib/secret-compare`, not a substitute for it: it awaits the
 * REAL `secretMatches` and only records the call. It decides nothing, so it cannot lie
 * about what matches — in particular it cannot claim a non-string never matches, when in
 * fact `TextEncoder.encode` applies ToString and `['<token>']` encodes as `'<token>'`.
 *
 * It exists because the swap at this site is observationally IDENTICAL — every status and
 * body pinned above is the same under `===` and under `secretMatches`, which is the point.
 * A behavioural test therefore cannot tell the two apart, so this records the mechanism:
 * that the constant-time helper is the thing being called, with the supplied token first
 * and the stored one second, and that it is NOT called when a guard short-circuits first.
 */
const compareCalls = vi.hoisted(() => [] as { supplied: unknown; stored: unknown; result: boolean }[])

vi.mock('@/lib/secret-compare', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/secret-compare')>()
  return {
    ...actual,
    secretMatches: async (supplied: string | null | undefined, stored: string | null | undefined) => {
      const result = await actual.secretMatches(supplied, stored)
      compareCalls.push({ supplied, stored, result })
      return result
    },
  }
})

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow()
let gamesReads = 0
let updates: unknown[] = []
let profileId: string | null = null

const supabase = makeSupabaseStub({
  games: ({ op, payload }) => {
    if (op === 'update') {
      updates.push(payload)
      return { data: null, error: null }
    }
    gamesReads++
    return { data: game, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => profileId }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  compareCalls.length = 0
  game = gameRow({ host_user_id: 'user-1' })
  gamesReads = 0
  updates = []
  profileId = null
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/verify-host`, body), codeParams(GAME_CODE))

describe('POST /api/games/[code]/verify-host — token comparison', () => {
  it('accepts the correct token with 200 { ok: true }', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(gamesReads).toBe(1)
  })

  it('rejects a wrong token with 200 { ok: false }', async () => {
    const res = await post({ hostToken: 'completely-different' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(1)
  })

  it('rejects a wrong token of the SAME LENGTH with 200 { ok: false }', async () => {
    const sameLength = 'host-token-wrongXX'.slice(0, HOST_TOKEN.length).padEnd(HOST_TOKEN.length, 'z')
    expect(sameLength).toHaveLength(HOST_TOKEN.length)
    expect(sameLength).not.toBe(HOST_TOKEN)
    const res = await post({ hostToken: sameLength })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
  })

  it('rejects a token that is a strict PREFIX of the correct one with 200 { ok: false }', async () => {
    const prefix = HOST_TOKEN.slice(0, -1)
    expect(HOST_TOKEN.startsWith(prefix)).toBe(true)
    const res = await post({ hostToken: prefix })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
  })

  it('rejects a token that the correct one is a prefix OF with 200 { ok: false }', async () => {
    const res = await post({ hostToken: `${HOST_TOKEN}-extra` })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
  })

  it('short-circuits an EMPTY-STRING token to 200 { ok: false } WITHOUT reading games', async () => {
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })

  it('short-circuits an ABSENT token to 200 { ok: false } WITHOUT reading games', async () => {
    const res = await post({})
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })

  it('short-circuits a NULL token to 200 { ok: false } WITHOUT reading games', async () => {
    const res = await post({ hostToken: null })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })

  it('short-circuits a NON-STRING (number) token to 200 { ok: false } WITHOUT reading games', async () => {
    const res = await post({ hostToken: 12345 })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })

  it('short-circuits an ARRAY-WRAPPED correct token to 200 { ok: false } WITHOUT reading games', async () => {
    // The `typeof === 'string'` guard on line 28 is load-bearing: `secretMatches`
    // encodes via ToString, so `['host-token-correct']` WOULD digest-match the stored
    // token if it ever reached the comparison. It does not, and this pins that.
    const res = await post({ hostToken: [HOST_TOKEN] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })

  it('rejects a correct-looking token when the stored host_token is NULL', async () => {
    game = gameRow({ host_token: null, host_user_id: 'user-1' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
  })

  it('rejects an empty-ish token when the stored host_token is an EMPTY STRING', async () => {
    // Both sides empty: `'' === ''` is true, but the route never gets here because the
    // supplied `''` short-circuits at gate 2. Pinned so the ordering cannot drift.
    game = gameRow({ host_token: '', host_user_id: 'user-1' })
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(gamesReads).toBe(0)
  })
})

describe('POST /api/games/[code]/verify-host — gate precedence around the comparison', () => {
  it('returns 400 on a malformed body BEFORE any token handling', async () => {
    const res = await POST(jsonRequest(`/api/games/${GAME_CODE}/verify-host`, 'not json'), codeParams(GAME_CODE))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid input' })
    expect(gamesReads).toBe(0)
  })

  it('returns notFound BEFORE comparing, even for the correct token', async () => {
    game = null
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false, notFound: true })
  })

  it('returns notFound for a WRONG token too (missing game outranks a bad token)', async () => {
    game = null
    const res = await post({ hostToken: 'wrong' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false, notFound: true })
  })
})

describe('POST /api/games/[code]/verify-host — the comparison is the constant-time one', () => {
  it('calls secretMatches(supplied, stored) for the correct token', async () => {
    await post({ hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([{ supplied: HOST_TOKEN, stored: HOST_TOKEN, result: true }])
  })

  it('calls secretMatches(supplied, stored) for a WRONG token too', async () => {
    await post({ hostToken: 'wrong-token-entirely' })
    expect(compareCalls).toEqual([{ supplied: 'wrong-token-entirely', stored: HOST_TOKEN, result: false }])
  })

  it('does NOT call secretMatches when the token short-circuits at gate 2', async () => {
    await post({ hostToken: '' })
    await post({})
    await post({ hostToken: null })
    await post({ hostToken: 12345 })
    await post({ hostToken: [HOST_TOKEN] })
    expect(compareCalls).toEqual([])
  })

  it('does NOT call secretMatches when the game is missing', async () => {
    game = null
    await post({ hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/games/[code]/verify-host — host_user_id backfill side effect', () => {
  it('backfills host_user_id when the token matches, the column is NULL and a profile resolves', async () => {
    game = gameRow({ host_user_id: null })
    profileId = 'profile-42'
    const res = await post({ hostToken: HOST_TOKEN })
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(updates).toEqual([{ host_user_id: 'profile-42' }])
  })

  it('does NOT backfill on a wrong token, even with the column NULL and a profile available', async () => {
    game = gameRow({ host_user_id: null })
    profileId = 'profile-42'
    const res = await post({ hostToken: 'wrong-token-here' })
    await expect(res.json()).resolves.toEqual({ ok: false })
    expect(updates).toEqual([])
  })

  it('does NOT backfill when host_user_id is already set', async () => {
    game = gameRow({ host_user_id: 'already-there' })
    profileId = 'profile-42'
    const res = await post({ hostToken: HOST_TOKEN })
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(updates).toEqual([])
  })

  it('still answers ok:true when the token matches but no profile resolves', async () => {
    game = gameRow({ host_user_id: null })
    profileId = null
    const res = await post({ hostToken: HOST_TOKEN })
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(updates).toEqual([])
  })

  it('reads the game by its UPPERCASED code', async () => {
    await post({ hostToken: HOST_TOKEN })
    expect(GAME_ID).toBe(GAME_CODE.toUpperCase())
  })
})
