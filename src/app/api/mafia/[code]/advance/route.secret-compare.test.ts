import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub, codeParams } from '@/test-support/host-auth'

/**
 * Characterization of the host-token comparison in POST /api/mafia/[code]/advance.
 *
 * Written against the ORIGINAL `game.host_token === hostToken` and re-run unmodified
 * against the `secretMatches(...)` swap.
 *
 * The authorization here is a TWO-branch ladder, and the swap puts an `await` inside the
 * first branch's condition, so the precedence is the thing most at risk:
 *
 *     if (typeof hostToken === 'string' && <compare>)   → authorized
 *     else if (isAuto === true && phase_deadline)       → authorized iff the deadline passed
 *     else                                              → 403
 *
 * Every combination that separates those two gates is pinned below — in particular a WRONG
 * token together with an expired auto deadline (must still authorize, via the else-if) and
 * a wrong token with an unexpired one (must 403). Testing each gate alone would let a swap
 * silently flip which branch wins.
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
let session: Record<string, unknown> | null = { phase: 'night', phase_deadline: null }
let advanceCalls: unknown[] = []
let advanceResult: { ok: boolean; error?: string; status?: number } = { ok: true }

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  mafia_sessions: () => ({ data: session, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/mafia-advance', () => ({
  runMafiaAdvance: async (gameId: string, opts: unknown) => {
    advanceCalls.push({ gameId, opts })
    return advanceResult
  },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

const PAST = () => new Date(Date.now() - 60_000).toISOString()
const FUTURE = () => new Date(Date.now() + 600_000).toISOString()

beforeEach(() => {
  compareCalls.length = 0
  game = gameRow()
  session = { phase: 'night', phase_deadline: null }
  advanceCalls = []
  advanceResult = { ok: true }
})

const post = (body: unknown) => POST(jsonRequest(`/api/mafia/${GAME_CODE}/advance`, body), codeParams(GAME_CODE))

const UNAUTHORIZED = { error: 'Unauthorized or phase not expired yet' }

describe('POST /api/mafia/[code]/advance — host-token branch', () => {
  it('authorizes the correct token with 200 { success: true }', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(advanceCalls).toHaveLength(1)
  })

  it('rejects a wrong token with 403', async () => {
    const res = await post({ hostToken: 'completely-different' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
    expect(advanceCalls).toHaveLength(0)
  })

  it('rejects a wrong token of the SAME LENGTH with 403', async () => {
    const sameLength = 'z'.repeat(HOST_TOKEN.length)
    expect(sameLength).toHaveLength(HOST_TOKEN.length)
    const res = await post({ hostToken: sameLength })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects a token that is a strict PREFIX of the correct one with 403', async () => {
    const res = await post({ hostToken: HOST_TOKEN.slice(0, -1) })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects a token the correct one is a prefix OF with 403', async () => {
    const res = await post({ hostToken: `${HOST_TOKEN}!` })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects an EMPTY-STRING token with 403', async () => {
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects an ABSENT token with 403', async () => {
    const res = await post({})
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects a NULL token with 403', async () => {
    const res = await post({ hostToken: null })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects a NON-STRING (number) token with 403', async () => {
    const res = await post({ hostToken: 12345 })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects an ARRAY-WRAPPED correct token with 403', async () => {
    // `typeof hostToken === 'string'` is load-bearing: `secretMatches` encodes via
    // ToString, so `['host-token-correct']` would digest-match if it reached the
    // comparison. The guard stops it; this pins that it still does.
    const res = await post({ hostToken: [HOST_TOKEN] })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  /**
   * THE ONE PIN THIS CHANGE MOVES — deliberate, and the only behaviour delta across all
   * three swapped sites.
   *
   * Before: `'' === ''` is true, so an empty supplied token AUTHORIZED against an empty
   * stored token (200). After: `secretMatches` requires both sides to be non-empty by
   * design — "a missing value on either side is never a match" — so it is 403.
   *
   * Unreachable in production: `games.host_token` is `text not null`
   * (0001_base_schema.sql) and every writer sets it from `generateToken()`, which always
   * returns 40 hex characters. An empty stored token would be a corrupt row, and refusing
   * to treat it as an authenticator is the safer answer for one.
   *
   * The other two sites cannot express this case at all — verify-host short-circuits an
   * empty supplied token before the comparison, and describe-it's zod `min(1)` rejects it
   * with a 400 — which is why this is the whole of the delta.
   */
  it('refuses an empty token when the stored host_token is also EMPTY (pin moved: was 200)', async () => {
    game = gameRow({ host_token: '' })
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('rejects any token when the stored host_token is NULL', async () => {
    game = gameRow({ host_token: null })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })
})

describe('POST /api/mafia/[code]/advance — host branch vs. isAuto branch precedence', () => {
  it('a WRONG token WITH an expired auto deadline still authorizes, via the else-if', async () => {
    session = { phase: 'night', phase_deadline: PAST() }
    const res = await post({ hostToken: 'wrong-token', isAuto: true })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    // Went down the isAuto branch, so expectedPhase is pinned.
    expect(advanceCalls).toEqual([{ gameId: 'ABCD', opts: { nextPhase: undefined, expectedPhase: 'night' } }])
  })

  it('a WRONG token with an UNEXPIRED auto deadline is 403', async () => {
    session = { phase: 'night', phase_deadline: FUTURE() }
    const res = await post({ hostToken: 'wrong-token', isAuto: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
    expect(advanceCalls).toHaveLength(0)
  })

  it('a WRONG token with isAuto but NO deadline is 403', async () => {
    session = { phase: 'night', phase_deadline: null }
    const res = await post({ hostToken: 'wrong-token', isAuto: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })

  it('the CORRECT token wins the host branch: expectedPhase stays undefined when isAuto is absent', async () => {
    session = { phase: 'night', phase_deadline: FUTURE() }
    const res = await post({ hostToken: HOST_TOKEN, nextPhase: 'day' })
    expect(res.status).toBe(200)
    expect(advanceCalls).toEqual([{ gameId: 'ABCD', opts: { nextPhase: 'day', expectedPhase: undefined } }])
  })

  it('the CORRECT token with isAuto:true still pins expectedPhase (isAuto drives the option, not the branch)', async () => {
    session = { phase: 'role_reveal', phase_deadline: FUTURE() }
    const res = await post({ hostToken: HOST_TOKEN, isAuto: true })
    expect(res.status).toBe(200)
    expect(advanceCalls).toEqual([{ gameId: 'ABCD', opts: { nextPhase: undefined, expectedPhase: 'role_reveal' } }])
  })

  it('NO token and an expired deadline but isAuto NOT true is 403', async () => {
    session = { phase: 'night', phase_deadline: PAST() }
    const res = await post({ isAuto: 'yes' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
  })
})

describe('POST /api/mafia/[code]/advance — the comparison is the constant-time one', () => {
  it('calls secretMatches(supplied, stored) for a supplied string token, right or wrong', async () => {
    await post({ hostToken: HOST_TOKEN })
    await post({ hostToken: 'wrong-token-entirely' })
    expect(compareCalls).toEqual([
      { supplied: HOST_TOKEN, stored: HOST_TOKEN, result: true },
      { supplied: 'wrong-token-entirely', stored: HOST_TOKEN, result: false },
    ])
  })

  it('does NOT call secretMatches for a non-string token (the typeof guard holds)', async () => {
    await post({ hostToken: [HOST_TOKEN] })
    await post({ hostToken: 12345 })
    await post({ hostToken: null })
    await post({})
    expect(compareCalls).toEqual([])
  })

  it('does NOT call secretMatches when the 404 gate fires first', async () => {
    game = null
    await post({ hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/mafia/[code]/advance — gates outranking the comparison', () => {
  it('returns 400 on a malformed body before any lookup or comparison', async () => {
    const res = await POST(jsonRequest(`/api/mafia/${GAME_CODE}/advance`, 'nope'), codeParams(GAME_CODE))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
  })

  it('returns 404 when the game is missing, even with the CORRECT token', async () => {
    game = null
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game or session not initialized' })
  })

  it('returns 404 when the session is missing, even with the CORRECT token', async () => {
    session = null
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game or session not initialized' })
  })

  it('propagates a runMafiaAdvance failure verbatim for an authorized host', async () => {
    advanceResult = { ok: false, error: 'Phase already advanced', status: 409 }
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Phase already advanced' })
  })
})
