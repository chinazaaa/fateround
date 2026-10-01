import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, GAME_ID, HOST_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-token comparison in POST /api/troll-run/advance.
 *
 * Written against the ORIGINAL `Boolean(hostToken) && hostToken === game.host_token`
 * and re-run unmodified against the `secretMatches(...)` swap.
 *
 * `isHost` is a derived BOOLEAN, not a gate that returns on its own — it feeds two
 * branches whose PRECEDENCE is the thing at risk in the swap:
 *
 *   forceNextRound truthy  → host-only: `!isHost` is 403 'Only the host can start the next round'
 *   forceNextRound falsy   → `!isHost` falls through to `assertPlayer(resumeToken)`
 *   isHost true            → NEITHER: no player lookup happens at all
 *
 * Every one of those is pinned below, including the negative "assertPlayer was not
 * called", because awaiting the comparison is exactly the kind of edit that could let a
 * later gate run first. It does not: the `await` sits at the same statement position, and
 * everything above it (`parseJsonBody`, the games read, the 404/type/status gates) was
 * already awaited before it.
 *
 * `hostToken` is `z.string().min(4).optional()` (declared in the route), so `''`, `null`,
 * a number and an array are all rejected with 400 BEFORE this line. That is what makes the
 * one behaviour delta #1193 found — `'' === ''` authorising where `secretMatches` refuses
 * — UNREACHABLE at this site: an empty supplied token never arrives.
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

const trollRunGame = (overrides: Record<string, unknown> = {}) =>
  gameRow({ game_type: 'troll_run', status: 'active', ...overrides })

let game: Record<string, unknown> | null = trollRunGame()
let playerCalls: { gameCode: string; resumeToken: unknown }[] = []
let playerResult: { error?: string; status?: number } = {}
let syncCalls: { gameId: string; options: { forceNextRound?: boolean } }[] = []
let syncResult: unknown = { ok: true, phase: 'racing' }
let syncThrows: Error | null = null

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async (_client: unknown, gameCode: string, resumeToken: unknown) => {
    playerCalls.push({ gameCode, resumeToken })
    return { ...playerResult, player: null, id: gameCode }
  },
}))
vi.mock('@/lib/troll-run-advance', () => ({
  syncTrollRunGameState: async (_client: unknown, gameId: string, options: { forceNextRound?: boolean } = {}) => {
    syncCalls.push({ gameId, options })
    if (syncThrows) throw syncThrows
    return syncResult
  },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  compareCalls.length = 0
  game = trollRunGame()
  playerCalls = []
  playerResult = {}
  syncCalls = []
  syncResult = { ok: true, phase: 'racing' }
  syncThrows = null
})

const post = (body: unknown) => POST(jsonRequest('/api/troll-run/advance', body))

const HOST_ONLY = { error: 'Only the host can start the next round' }

describe('POST /api/troll-run/advance — isHost derivation from the host token', () => {
  it('lets the CORRECT token force the next round with 200, and never looks up a player', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, phase: 'racing' })
    expect(syncCalls).toEqual([{ gameId: GAME_ID, options: { forceNextRound: true } }])
    expect(playerCalls).toEqual([])
  })

  it('rejects a WRONG token forcing the next round with 403', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: 'completely-different', forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
    expect(syncCalls).toEqual([])
    expect(playerCalls).toEqual([])
  })

  it('rejects a wrong token of the SAME LENGTH with 403', async () => {
    const sameLength = 'z'.repeat(HOST_TOKEN.length)
    expect(sameLength).toHaveLength(HOST_TOKEN.length)
    const res = await post({ gameId: GAME_ID, hostToken: sameLength, forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })

  it('rejects a strict PREFIX of the correct token with 403', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN.slice(0, -1), forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })

  it('rejects a token the correct one is a prefix OF with 403', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: `${HOST_TOKEN}x`, forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })

  it('rejects an ABSENT token forcing the next round with 403 (the short-circuit arm)', async () => {
    const res = await post({ gameId: GAME_ID, forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })

  it('refuses a correct token when the stored host_token is NULL', async () => {
    game = trollRunGame({ host_token: null })
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })

  it('refuses a supplied token when the stored host_token is an EMPTY STRING', async () => {
    game = trollRunGame({ host_token: '' })
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(HOST_ONLY)
  })
})

describe('POST /api/troll-run/advance — branch precedence between isHost and the player fallback', () => {
  it('a NON-host plain nudge falls through to assertPlayer and advances when it passes', async () => {
    const res = await post({ gameId: GAME_ID, resumeToken: 'player-resume-token' })
    expect(res.status).toBe(200)
    expect(playerCalls).toEqual([{ gameCode: GAME_ID, resumeToken: 'player-resume-token' }])
    expect(syncCalls).toEqual([{ gameId: GAME_ID, options: { forceNextRound: undefined } }])
  })

  it('a NON-host plain nudge surfaces the assertPlayer failure verbatim', async () => {
    playerResult = { error: 'Missing or invalid player code', status: 403 }
    const res = await post({ gameId: GAME_ID })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Missing or invalid player code' })
    expect(syncCalls).toEqual([])
  })

  it('a WRONG-token plain nudge still falls through to assertPlayer, not to a 403', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: 'wrong-token', resumeToken: 'player-resume-token' })
    expect(res.status).toBe(200)
    expect(playerCalls).toEqual([{ gameCode: GAME_ID, resumeToken: 'player-resume-token' }])
  })

  it('the HOST skips assertPlayer entirely on a plain nudge, even with no resumeToken', async () => {
    playerResult = { error: 'Missing or invalid player code', status: 403 }
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    expect(playerCalls).toEqual([])
    expect(syncCalls).toEqual([{ gameId: GAME_ID, options: { forceNextRound: undefined } }])
  })

  it('forceNextRound:false is falsy, so a non-host takes the player path rather than the 403', async () => {
    const res = await post({ gameId: GAME_ID, resumeToken: 'player-resume-token', forceNextRound: false })
    expect(res.status).toBe(200)
    expect(playerCalls).toHaveLength(1)
    expect(syncCalls).toEqual([{ gameId: GAME_ID, options: { forceNextRound: false } }])
  })
})

describe('POST /api/troll-run/advance — the comparison is the constant-time one', () => {
  it('calls secretMatches(supplied, stored) for a supplied token, right or wrong', async () => {
    await post({ gameId: GAME_ID, hostToken: HOST_TOKEN })
    await post({ gameId: GAME_ID, hostToken: 'wrong-token-entirely', resumeToken: 'player-resume-token' })
    expect(compareCalls).toEqual([
      { supplied: HOST_TOKEN, stored: HOST_TOKEN, result: true },
      { supplied: 'wrong-token-entirely', stored: HOST_TOKEN, result: false },
    ])
  })

  it('does NOT call secretMatches when no token is supplied (the short-circuit holds)', async () => {
    await post({ gameId: GAME_ID, resumeToken: 'player-resume-token' })
    expect(compareCalls).toEqual([])
  })

  it('does NOT call secretMatches when the 404, game-type or status gate fires first', async () => {
    game = null
    await post({ gameId: GAME_ID, hostToken: HOST_TOKEN })
    game = trollRunGame({ game_type: 'smash_marry_kill' })
    await post({ gameId: GAME_ID, hostToken: HOST_TOKEN })
    game = trollRunGame({ status: 'waiting' })
    await post({ gameId: GAME_ID, hostToken: HOST_TOKEN })
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/troll-run/advance — the schema rejects non-string tokens before the comparison', () => {
  it('rejects an EMPTY-STRING token with 400 (min(4)), never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: '', forceNextRound: true })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
    expect(syncCalls).toEqual([])
  })

  it('rejects a NULL token with 400, never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: null })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('rejects a NON-STRING (number) token with 400, never reaching the comparison', async () => {
    const res = await post({ gameId: GAME_ID, hostToken: 12345 })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('rejects an ARRAY-WRAPPED correct token with 400, never reaching the comparison', async () => {
    // Load-bearing: `secretMatches` encodes via ToString, so `['host-token-correct']`
    // would digest-match the stored token. The zod schema is what stops it here.
    const res = await post({ gameId: GAME_ID, hostToken: [HOST_TOKEN], forceNextRound: true })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
    expect(syncCalls).toEqual([])
  })

  it('rejects a malformed body with 400 "Invalid or empty request body"', async () => {
    const res = await POST(jsonRequest('/api/troll-run/advance', 'nope'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })
})

describe('POST /api/troll-run/advance — gates outranking the comparison', () => {
  it('returns 404 when the game is missing, even with the CORRECT token', async () => {
    game = null
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns the game-TYPE 400 before deriving isHost, even with the CORRECT token', async () => {
    game = trollRunGame({ game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Troll Run game' })
  })

  it('returns the STATUS 400 before deriving isHost, even with the CORRECT token', async () => {
    game = trollRunGame({ status: 'waiting' })
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game is not active' })
  })

  it('returns 404 "Race not found" when the sync reports not-ok for an authorized host', async () => {
    syncResult = { ok: false }
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Race not found' })
  })

  it('returns 500 when the sync throws for an authorized host', async () => {
    syncThrows = new Error('boom')
    const res = await post({ gameId: GAME_ID, hostToken: HOST_TOKEN, forceNextRound: true })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
  })

  it('uppercases the game code via the schema before reading the game', async () => {
    await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(syncCalls).toEqual([{ gameId: GAME_CODE.toUpperCase(), options: { forceNextRound: undefined } }])
  })
})
