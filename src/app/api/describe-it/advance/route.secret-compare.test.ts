import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-token comparison in POST /api/describe-it/advance.
 *
 * Written against the ORIGINAL `!!data.hostToken && data.hostToken === game.host_token`
 * and re-run unmodified against the `secretMatches(...)` swap.
 *
 * `force` is not a gate that returns a status — it is a BOOLEAN handed to
 * `processDescribeItAdvance`, so the observable thing is the argument, and every case
 * below asserts it literally. Two properties are at risk in the swap:
 *
 *   1. short-circuit — `!!data.hostToken &&` must still skip the comparison entirely for
 *      an absent token, so a token-less poll does no digest work.
 *   2. the VALUE stays a strict boolean, not a promise and not a truthy string.
 *
 * `hostToken` is `z.string().min(1).optional()`, so `''`, `null`, a number and an array
 * are all rejected by the schema with 400 BEFORE this line — those cases are pinned here
 * as 400s rather than as `force` values, because that is what the route actually does.
 *
 * `@/lib/secret-compare` is deliberately NOT mocked — the real comparison is under test.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ game_type: 'describe_it' })
let advanceCalls: { code: string; opts: { force: boolean } }[] = []
let advanceResult: { error?: string; internal?: boolean } = {}

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/describe-it', () => ({
  processDescribeItAdvance: async (_client: unknown, code: string, opts: { force: boolean }) => {
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
  game = gameRow({ game_type: 'describe_it' })
  advanceCalls = []
  advanceResult = {}
})

const post = (body: unknown) => POST(jsonRequest('/api/describe-it/advance', body))

/** The `force` value the route computed, asserted to be a strict boolean. */
const forceOf = () => {
  expect(advanceCalls).toHaveLength(1)
  const f = advanceCalls[0].opts.force
  expect(typeof f).toBe('boolean')
  return f
}

describe('POST /api/describe-it/advance — force derivation from the host token', () => {
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
    game = gameRow({ game_type: 'describe_it', host_token: null })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the stored host_token is an EMPTY STRING and a token is supplied', async () => {
    game = gameRow({ game_type: 'describe_it', host_token: '' })
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(forceOf()).toBe(false)
  })

  it('derives force=false when the stored host_token is NULL and no token is supplied', async () => {
    game = gameRow({ game_type: 'describe_it', host_token: null })
    await post({ gameId: GAME_CODE })
    expect(forceOf()).toBe(false)
  })
})

describe('POST /api/describe-it/advance — the schema rejects non-string tokens before the comparison', () => {
  it('rejects an EMPTY-STRING token with 400 (min(1)), never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '' })
    expect(res.status).toBe(400)
    expect(advanceCalls).toHaveLength(0)
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
  })

  it('rejects a malformed body with 400 "Invalid or empty request body"', async () => {
    const res = await POST(jsonRequest('/api/describe-it/advance', 'nope'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(advanceCalls).toHaveLength(0)
  })
})

describe('POST /api/describe-it/advance — gates outranking the comparison', () => {
  it('returns 404 when the game is missing, even with the CORRECT token', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
    expect(advanceCalls).toHaveLength(0)
  })

  it('returns the game-TYPE 400 before computing force, even with the CORRECT token', async () => {
    game = gameRow({ game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Text Charades game' })
    expect(advanceCalls).toHaveLength(0)
  })

  it('surfaces a processDescribeItAdvance error as 400 for a non-internal failure', async () => {
    advanceResult = { error: 'Break is not over', internal: false }
    const res = await post({ gameId: GAME_CODE })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Break is not over' })
    expect(forceOf()).toBe(false)
  })

  it('surfaces an internal processDescribeItAdvance error as 500 for a forcing host', async () => {
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
