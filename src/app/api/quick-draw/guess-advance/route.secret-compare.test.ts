import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-token comparison in POST /api/quick-draw/guess-advance.
 *
 * Written against the ORIGINAL `!!data.hostToken && data.hostToken === game.host_token`
 * and re-run unmodified against the `secretMatches(...)` swap.
 *
 * `force` is not a gate that returns a status — it is a BOOLEAN handed to
 * `processQuickDrawGuessAdvance`, so the observable thing is the argument, and every case
 * below asserts it literally. Two properties are at risk in the swap:
 *
 *   1. short-circuit — `!!data.hostToken &&` must still skip the comparison entirely for
 *      an absent token, so a token-less poll does no digest work.
 *   2. the VALUE stays a strict boolean, not a promise and not a truthy string.
 *
 * `hostToken` is `z.string().min(1).optional()` (validation/round-games.ts), so `''`,
 * `null`, a number and an array are all rejected by the schema with 400 BEFORE this line.
 * That is what makes the one behaviour delta #1193 found — `'' === ''` authorising where
 * `secretMatches` refuses — UNREACHABLE at this site: an empty supplied token never
 * arrives. Those cases are pinned here as 400s rather than as `force` values, because
 * that is what the route actually does.
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

const quickDrawGame = (overrides: Record<string, unknown> = {}) =>
  gameRow({ game_type: 'quick_draw', quick_draw_variant: 'guess', ...overrides })

let game: Record<string, unknown> | null = quickDrawGame()
let advanceCalls: { code: string; opts: { force: boolean } }[] = []
let advanceResult: { error?: string; internal?: boolean } = {}

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/quick-draw-guess', () => ({
  processQuickDrawGuessAdvance: async (_client: unknown, code: string, opts: { force: boolean }) => {
    advanceCalls.push({ code, opts })
    return advanceResult
  },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  compareCalls.length = 0
  game = quickDrawGame()
  advanceCalls = []
  advanceResult = {}
})

const post = (body: unknown) => POST(jsonRequest('/api/quick-draw/guess-advance', body))

/** The `force` value the route computed, asserted to be a strict boolean. */
const forceOf = () => {
  expect(advanceCalls).toHaveLength(1)
  const f = advanceCalls[0].opts.force
  expect(typeof f).toBe('boolean')
  return f
}

describe('POST /api/quick-draw/guess-advance — force derivation from the host token', () => {
  it('derives force=true from the correct token', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(forceOf()).toBe(true)
  })

  it('derives force=false from a wrong token, and still advances', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: 'completely-different' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false from a wrong token of the SAME LENGTH', async () => {
    const sameLength = 'z'.repeat(HOST_TOKEN.length)
    expect(sameLength).toHaveLength(HOST_TOKEN.length)
    await post({ gameId: GAME_CODE, hostToken: sameLength })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false from a strict PREFIX of the correct token', async () => {
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN.slice(0, -1) })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false from a token the correct one is a prefix OF', async () => {
    await post({ gameId: GAME_CODE, hostToken: `${HOST_TOKEN}x` })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the token is ABSENT (the short-circuit arm)', async () => {
    const res = await post({ gameId: GAME_CODE })
    expect(res.status).toBe(200)
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the stored host_token is NULL and a token is supplied', async () => {
    game = quickDrawGame({ host_token: null })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the stored host_token is an EMPTY STRING and a token is supplied', async () => {
    game = quickDrawGame({ host_token: '' })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the stored host_token is NULL and no token is supplied', async () => {
    game = quickDrawGame({ host_token: null })
    await post({ gameId: GAME_CODE })
    expect(forceOf()).toBe(false)
  })
})

describe('POST /api/quick-draw/guess-advance — the comparison is the constant-time one', () => {
  it('calls secretMatches(supplied, stored) when a token is supplied', async () => {
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([{ supplied: HOST_TOKEN, stored: HOST_TOKEN, result: true }])
  })

  it('calls secretMatches(supplied, stored) for a WRONG token too', async () => {
    await post({ gameId: GAME_CODE, hostToken: 'wrong-token-entirely' })
    expect(compareCalls).toEqual([{ supplied: 'wrong-token-entirely', stored: HOST_TOKEN, result: false }])
  })

  it('does NOT call secretMatches when no token is supplied (the short-circuit holds)', async () => {
    await post({ gameId: GAME_CODE })
    expect(compareCalls).toEqual([])
  })

  it('does NOT call secretMatches when the 404, game-type or variant gate fires first', async () => {
    game = null
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    game = quickDrawGame({ game_type: 'smash_marry_kill' })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    game = quickDrawGame({ quick_draw_variant: 'draw' })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/quick-draw/guess-advance — the schema rejects non-string tokens before the comparison', () => {
  it('rejects an EMPTY-STRING token with 400 (min(1)), never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '' })
    expect(res.status).toBe(400)
    expect(advanceCalls).toHaveLength(0)
    expect(compareCalls).toEqual([])
  })

  it('rejects a NULL token with 400, never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: null })
    expect(res.status).toBe(400)
    expect(advanceCalls).toHaveLength(0)
  })

  it('rejects a NON-STRING (number) token with 400, never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: 12345 })
    expect(res.status).toBe(400)
    expect(advanceCalls).toHaveLength(0)
  })

  it('rejects an ARRAY-WRAPPED correct token with 400, never reaching the comparison', async () => {
    // Load-bearing: `secretMatches` encodes via ToString, so `['host-token-correct']`
    // would digest-match the stored token. The zod schema is what stops it here.
    const res = await post({ gameId: GAME_CODE, hostToken: [HOST_TOKEN] })
    expect(res.status).toBe(400)
    expect(advanceCalls).toHaveLength(0)
    expect(compareCalls).toEqual([])
  })

  it('rejects a malformed body with 400 "Invalid or empty request body"', async () => {
    const res = await POST(jsonRequest('/api/quick-draw/guess-advance', 'nope'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(advanceCalls).toHaveLength(0)
  })
})

describe('POST /api/quick-draw/guess-advance — gates outranking the comparison', () => {
  it('returns 404 when the game is missing, even with the CORRECT token', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
    expect(advanceCalls).toHaveLength(0)
  })

  it('returns the game-TYPE 400 before computing force, even with the CORRECT token', async () => {
    game = quickDrawGame({ game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Quick Draw game' })
    expect(advanceCalls).toHaveLength(0)
  })

  it('returns the VARIANT 400 before computing force, even with the CORRECT token', async () => {
    game = quickDrawGame({ quick_draw_variant: 'draw' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not in guess mode' })
    expect(advanceCalls).toHaveLength(0)
  })

  it('surfaces a processQuickDrawGuessAdvance error as 400 for a non-internal failure', async () => {
    advanceResult = { error: 'Round is still running', internal: false }
    const res = await post({ gameId: GAME_CODE })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Round is still running' })
    expect(forceOf()).toBe(false)
  })

  it('surfaces an internal processQuickDrawGuessAdvance error as 500 for a forcing host', async () => {
    advanceResult = { error: 'boom', internal: true }
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'boom' })
    expect(forceOf()).toBe(true)
  })

  it('uppercases the game code it advances', async () => {
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(advanceCalls[0].code).toBe(GAME_CODE.toUpperCase())
  })
})
