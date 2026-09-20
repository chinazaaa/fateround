import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Characterization matrix for the `gameCode` (and, where present, `hostToken` / `q`) field of
 * ten routes that read their body as
 *
 *     const body = (await req.json().catch(() => ({}))) as { gameCode?: string; ... }
 *     const gameId = body.gameCode?.toUpperCase()
 *     if (!gameId) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })
 *
 * The `as {...}` cast is an assertion, not a check: `req.json()` yields arbitrary JSON, so a
 * truthy non-string (`5`, `true`, `{}`, `["ABCD"]`) clears `?.` and throws a TypeError on
 * `.toUpperCase()`. Unlike /api/wst-quotes (#1179), every handler here wraps its body in
 * try/catch, so the TypeError is swallowed and answered as a 500 via `internalErrorMessage`
 * instead of the 400 the request deserves — which is why it went unnoticed.
 *
 * The gate is the FIRST statement of every handler: there is exactly one path to the throwing
 * line, reached before the rate limiter and before any Supabase call. The matrix still runs each
 * bad value through both a player-shaped body (`resumeToken`) and a host-shaped body
 * (`hostToken`), and asserts the rate limiter and Supabase were never touched, so the gate
 * cannot be satisfied by a downstream branch.
 *
 * `null`, absent and `''` are falsy and already hit `if (!gameId)`. Their rows MUST NOT move: a
 * schema-level `z.string()` would turn `null` into an "expected string, received null" 400 on a
 * request these routes handle today (CONTRIBUTING.md — #1163 / #1153).
 *
 * After the fix, five groups of rows in this file carry a PIN MOVED note — they asserted the
 * 500 that was the defect. Everything else in the file is byte-identical to what ran green
 * against the unchanged routes.
 */

const { rateLimitSpy, resolveHandViewerSpy, redactHandsSpy, assertPlayerSpy, searchTracksSpy, fromSpy } = vi.hoisted(
  () => ({
    rateLimitSpy: vi.fn(async () => null),
    resolveHandViewerSpy: vi.fn(async () => 'p1' as string | null),
    redactHandsSpy: vi.fn((rows: unknown[], viewerId: unknown) => [{ redactedFor: viewerId, count: rows.length }]),
    assertPlayerSpy: vi.fn(async (_s: unknown, _code: string, _t: unknown, _o?: unknown) => ({
      error: 'Auth reached',
      status: 404,
      player: null,
    })),
    searchTracksSpy: vi.fn(async () => [{ id: 't1' }]),
    fromSpy: vi.fn(),
  })
)

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: rateLimitSpy,
  RATE_LIMITS: { handsFetch: { limit: 60, windowMs: 60_000 }, codewordsBoard: { limit: 60, windowMs: 60_000 } },
}))
vi.mock('@/lib/hand-redaction', () => ({
  resolveHandViewer: resolveHandViewerSpy,
  redactHands: redactHandsSpy,
}))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: assertPlayerSpy }))
vi.mock('@/lib/spotify', () => ({ searchTracks: searchTracksSpy }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

// ---------------------------------------------------------------------------------------------
// A minimal PostgREST-shaped stub. `tables` is reassigned per test to say what each table
// answers; `eqCalls` records the filters so the normalised (upper-cased) game code is
// observable, and `writes` records mutations.
// ---------------------------------------------------------------------------------------------

type Result = { data: unknown; error: unknown }
let tables: Record<string, Result> = {}
let eqCalls: { table: string; column: string; value: unknown }[] = []
let writes: { table: string; op: string; payload?: unknown }[] = []

function answer(table: string): Result {
  return tables[table] ?? { data: null, error: null }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeChain(table: string): any {
  const chain: any = {
    select: () => chain,
    order: () => chain,
    eq: (column: string, value: unknown) => {
      eqCalls.push({ table, column, value })
      return chain
    },
    update: (payload: unknown) => {
      writes.push({ table, op: 'update', payload })
      return chain
    },
    delete: () => {
      writes.push({ table, op: 'delete' })
      return chain
    },
    upsert: (payload: unknown) => {
      writes.push({ table, op: 'upsert', payload })
      return chain
    },
    maybeSingle: async () => answer(table),
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(answer(table)).then(onFulfilled, onRejected),
  }
  return chain
}

function post(handler: (req: any) => Promise<Response>, path: string, body: unknown) {
  return handler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { POST as crazyEightsHands } from './crazy-eights/hands/route'
import { POST as whotHands } from './whot/hands/route'
import { POST as gofishHands } from './gofish/hands/route'
import { POST as bingoCard } from './bingo/card/route'
import { POST as describeItMyWord } from './describe-it/my-word/route'
import { POST as quickDrawMyWord } from './quick-draw/my-word/route'
import { POST as twoTruthsMyStatement } from './two-truths/my-statement/route'
import { POST as twoTruthsMyGuesses } from './two-truths/my-guesses/route'
import { POST as spotifySearch } from './spotify/search/route'
import { POST as musicControl } from './music/control/route'
import { POST as codewordsBoard } from './codewords/board/route'

const PLAYER_TOKEN = 'AAAA1111BBBB2222'
const HOST_TOKEN = 'host-token-value'

type RouteCase = {
  name: string
  path: string
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  handler: (req: any) => Promise<Response>
  /** The 400 a missing/invalid gameCode gets. */
  missingError: string
  /** The `internalErrorMessage` fallback the handler-level catch answers with. */
  catchFallback: string
  /** Body fields, apart from gameCode, for a player-shaped request. */
  playerExtras: Record<string, unknown>
  /** Body fields, apart from gameCode, for a host-shaped request. */
  hostExtras: Record<string, unknown>
  /** Arrange the Supabase stub so a valid gameCode reaches a deterministic 2xx/4xx answer. */
  arrange: () => void
  /** What a valid `gameCode: 'abcd'` request answers, and where the upper-cased code landed. */
  valid: { status: number; json: unknown; assertCode: () => void }
}

/** The game code every "valid" row sends, lower case, to prove upper-casing still happens. */
const LOWER = 'abcd'
const UPPER = 'ABCD'

function expectGameIdSeen(table: string, column: string) {
  expect(eqCalls).toContainEqual({ table, column, value: UPPER })
}

const handsRoute = (
  name: string,
  path: string,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  handler: (req: any) => Promise<Response>,
  handsTable: string
): RouteCase => ({
  name,
  path,
  handler,
  missingError: 'gameCode is required',
  catchFallback: 'Failed to load hands',
  playerExtras: { resumeToken: PLAYER_TOKEN },
  hostExtras: { hostToken: HOST_TOKEN },
  arrange: () => {
    tables = {
      games: { data: { status: 'live' }, error: null },
      [handsTable]: { data: [{ player_id: 'p1' }], error: null },
    }
  },
  valid: {
    status: 200,
    json: { hands: [{ redactedFor: 'p1', count: 1 }] },
    assertCode: () => expectGameIdSeen(handsTable, 'game_id'),
  },
})

const ROUTES: RouteCase[] = [
  handsRoute('crazy-eights/hands', '/api/crazy-eights/hands', crazyEightsHands, 'crazy_eights_player_hands'),
  handsRoute('whot/hands', '/api/whot/hands', whotHands, 'whot_player_hands'),
  handsRoute('gofish/hands', '/api/gofish/hands', gofishHands, 'gofish_player_hands'),
  {
    name: 'bingo/card',
    path: '/api/bingo/card',
    handler: bingoCard,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load card',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    // bingo/card has no host path at all; a host-shaped body is still a legitimate request
    // shape to send, and must be turned away by the same gate.
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = {
        games: { data: { game_type: 'bingo' }, error: null },
        bingo_cards: { data: { id: 'c1' }, error: null },
      }
    },
    valid: {
      status: 200,
      json: { card: { id: 'c1' } },
      assertCode: () => expectGameIdSeen('bingo_cards', 'game_id'),
    },
  },
  {
    name: 'describe-it/my-word',
    path: '/api/describe-it/my-word',
    handler: describeItMyWord,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load your word',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = {
        games: {
          data: { game_type: 'describe_it', host_token: HOST_TOKEN, host_player_id: 'p1' },
          error: null,
        },
        describe_it_sessions: { data: { describer_player_id: 'p1', current_word: 'moon' }, error: null },
        players: { data: { id: 'p1' }, error: null },
      }
    },
    valid: {
      status: 200,
      json: { word: 'moon' },
      assertCode: () => expectGameIdSeen('describe_it_sessions', 'game_id'),
    },
  },
  {
    name: 'quick-draw/my-word',
    path: '/api/quick-draw/my-word',
    handler: quickDrawMyWord,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load your word',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = {
        games: {
          data: {
            game_type: 'quick_draw',
            quick_draw_variant: 'guess',
            host_token: HOST_TOKEN,
            host_player_id: 'p1',
          },
          error: null,
        },
        quick_draw_guess_sessions: { data: { drawer_player_id: 'p1', current_word: 'cat' }, error: null },
        players: { data: { id: 'p1' }, error: null },
      }
    },
    valid: {
      status: 200,
      json: { word: 'cat' },
      assertCode: () => expectGameIdSeen('quick_draw_guess_sessions', 'game_id'),
    },
  },
  {
    name: 'two-truths/my-statement',
    path: '/api/two-truths/my-statement',
    handler: twoTruthsMyStatement,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load your statement',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = { games: { data: { game_type: 'two_truths' }, error: null } }
    },
    // assertPlayer is stubbed to a distinctive 404, so "got past the gameCode gate" is
    // observable and the normalised code it received is checked directly.
    valid: {
      status: 404,
      json: { error: 'Auth reached' },
      assertCode: () =>
        expect(assertPlayerSpy).toHaveBeenCalledWith(expect.anything(), UPPER, PLAYER_TOKEN, { readOnly: true }),
    },
  },
  {
    name: 'two-truths/my-guesses',
    path: '/api/two-truths/my-guesses',
    handler: twoTruthsMyGuesses,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load your guesses',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = { games: { data: { game_type: 'two_truths' }, error: null } }
    },
    valid: {
      status: 404,
      json: { error: 'Auth reached' },
      assertCode: () =>
        expect(assertPlayerSpy).toHaveBeenCalledWith(expect.anything(), UPPER, PLAYER_TOKEN, { readOnly: true }),
    },
  },
  {
    // Not on the original list, but the identical shape: same field, same 400 wording, same
    // whole-handler catch. Folded in because the fix is character-for-character the same.
    name: 'codewords/board',
    path: '/api/codewords/board',
    handler: codewordsBoard,
    missingError: 'gameCode is required',
    catchFallback: 'Failed to load the board',
    playerExtras: { resumeToken: PLAYER_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      // No board row: a deterministic 200 that still proves the normalised code reached the DB.
      tables = { codewords_boards: { data: null, error: null } }
    },
    valid: {
      status: 200,
      json: { board: null },
      assertCode: () => expectGameIdSeen('codewords_boards', 'game_id'),
    },
  },
  {
    name: 'spotify/search',
    path: '/api/spotify/search',
    handler: spotifySearch,
    missingError: 'gameCode and hostToken are required',
    catchFallback: 'Spotify search failed',
    // This route is host-only: hostToken is required on BOTH shapes, or the request is
    // turned away by the same combined gate for the wrong reason.
    playerExtras: { hostToken: HOST_TOKEN, q: 'abba' },
    hostExtras: { hostToken: HOST_TOKEN, q: 'abba' },
    arrange: () => {
      tables = { games: { data: { host_token: HOST_TOKEN }, error: null } }
    },
    valid: {
      status: 200,
      json: { tracks: [{ id: 't1' }] },
      assertCode: () => expectGameIdSeen('games', 'id'),
    },
  },
  {
    name: 'music/control',
    path: '/api/music/control',
    handler: musicControl,
    missingError: 'gameCode and hostToken are required',
    catchFallback: 'Music control failed',
    playerExtras: { hostToken: HOST_TOKEN },
    hostExtras: { hostToken: HOST_TOKEN },
    arrange: () => {
      tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
    },
    valid: {
      status: 200,
      json: { success: true },
      assertCode: () => expectGameIdSeen('games', 'id'),
    },
  },
]

/**
 * Every non-string JSON value. `?.` short-circuits on NULLISH values only, not falsy ones, so
 * `0` and `false` reach the String method and throw exactly like `5` and `true` do — they are
 * not "turned away one gate earlier" as one might assume. All six are 500 today.
 */
const NON_STRING: [string, unknown][] = [
  ['a number', 5],
  ['a boolean', true],
  ['an object', {}],
  ['an array', ['ABCD']],
  ['0', 0],
  ['false', false],
]

/**
 * The values that are genuinely handled today, by `?.` (null) or by the falsy gate (''). An
 * absent field behaves identically and is covered by its own `it` alongside each use of this
 * list, because it cannot be expressed as a value here. These rows MUST NOT move — see the
 * file header.
 */
const HANDLED_AS_ABSENT: [string, unknown][] = [
  ['null', null],
  ['an empty string', ''],
]

beforeEach(() => {
  tables = {}
  eqCalls = []
  writes = []
  vi.clearAllMocks()
  rateLimitSpy.mockResolvedValue(null)
  resolveHandViewerSpy.mockResolvedValue('p1')
  redactHandsSpy.mockImplementation((rows: unknown[], viewerId: unknown) => [
    { redactedFor: viewerId, count: rows.length },
  ])
  assertPlayerSpy.mockResolvedValue({ error: 'Auth reached', status: 404, player: null })
  searchTracksSpy.mockResolvedValue([{ id: 't1' }])
  fromSpy.mockImplementation((table: string) => makeChain(table))
  // internalErrorMessage logs the swallowed TypeError; keep the run readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe.each(ROUTES.map((r) => [r.name, r] as const))('POST %s — gameCode type matrix', (_name, route) => {
  const shapes = [
    ['player-shaped body', () => route.playerExtras],
    ['host-shaped body', () => route.hostExtras],
  ] as const

  // --- falsy gameCode: behaviour that MUST NOT change -----------------------------------
  describe.each(shapes)('%s', (_shape, extras) => {
    it.each(HANDLED_AS_ABSENT)('treats %s gameCode as absent: 400, no rate limit, no DB', async (_label, gameCode) => {
      const res = await post(route.handler, route.path, { gameCode, ...extras() })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: route.missingError })
      expect(rateLimitSpy).not.toHaveBeenCalled()
      expect(fromSpy).not.toHaveBeenCalled()
    })

    it('treats an absent gameCode as absent: 400, no rate limit, no DB', async () => {
      const res = await post(route.handler, route.path, { ...extras() })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: route.missingError })
      expect(rateLimitSpy).not.toHaveBeenCalled()
      expect(fromSpy).not.toHaveBeenCalled()
    })

    it('rejects a completely empty body with 400, no rate limit, no DB', async () => {
      const res = await post(route.handler, route.path, {})
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: route.missingError })
      expect(rateLimitSpy).not.toHaveBeenCalled()
      expect(fromSpy).not.toHaveBeenCalled()
    })

    // --- non-string gameCode: THE BUG ----------------------------------------------------
    // PIN MOVED. Against the unchanged routes these rows asserted `500` with
    // `route.catchFallback` — the swallowed TypeError. That 500 was the defect, so the
    // assertion moves with the fix to the 400 a malformed gameCode has always deserved,
    // worded exactly as the route's own missing-field answer.
    it.each(NON_STRING)('rejects %s gameCode with 400, no rate limit, no DB', async (_label, gameCode) => {
      const res = await post(route.handler, route.path, { gameCode, ...extras() })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: route.missingError })
      expect(rateLimitSpy).not.toHaveBeenCalled()
      expect(fromSpy).not.toHaveBeenCalled()
      expect(writes).toEqual([])
      // The 500 this used to answer must be gone for good.
      expect(res.status).not.toBe(500)
    })
  })

  // --- a valid gameCode still gets through, still upper-cased ---------------------------
  it('lets a lower-case string gameCode through, upper-cased', async () => {
    route.arrange()
    const res = await post(route.handler, route.path, { gameCode: LOWER, ...route.playerExtras })
    expect(res.status).toBe(route.valid.status)
    await expect(res.json()).resolves.toEqual(route.valid.json)
    expect(rateLimitSpy).toHaveBeenCalledTimes(
      route.name.startsWith('spotify') || route.name.startsWith('music') ? 0 : 1
    )
    route.valid.assertCode()
  })

  it('lets an already-upper-case gameCode through unchanged', async () => {
    route.arrange()
    const res = await post(route.handler, route.path, { gameCode: UPPER, ...route.playerExtras })
    expect(res.status).toBe(route.valid.status)
    await expect(res.json()).resolves.toEqual(route.valid.json)
    route.valid.assertCode()
  })
})

// ---------------------------------------------------------------------------------------------
// Whitespace handling differs between the two families and must not drift: the eight
// hands/word/statement routes upper-case WITHOUT trimming, while spotify/search and
// music/control trim first (so a whitespace-only code collapses to '' and hits the gate).
// ---------------------------------------------------------------------------------------------

describe('whitespace handling (unchanged by the fix)', () => {
  const untrimmed = ROUTES.filter((r) => r.missingError === 'gameCode is required')
  const trimmed = ROUTES.filter((r) => r.missingError === 'gameCode and hostToken are required')

  it.each(untrimmed.map((r) => [r.name, r] as const))(
    '%s passes a padded gameCode through untrimmed',
    async (_n, route) => {
      route.arrange()
      const res = await post(route.handler, route.path, { gameCode: ' abcd ', ...route.playerExtras })
      // Never a 400: the value is truthy and untrimmed, so it reaches the DB / auth verbatim.
      expect(res.status).not.toBe(400)
      if (route.name.startsWith('two-truths')) {
        expect(assertPlayerSpy).toHaveBeenCalledWith(expect.anything(), ' ABCD ', PLAYER_TOKEN, { readOnly: true })
      } else {
        expect(eqCalls.some((c) => c.value === ' ABCD ')).toBe(true)
      }
    }
  )

  it.each(trimmed.map((r) => [r.name, r] as const))('%s trims before upper-casing', async (_n, route) => {
    route.arrange()
    const res = await post(route.handler, route.path, { gameCode: ' abcd ', ...route.playerExtras })
    expect(res.status).toBe(route.valid.status)
    expect(eqCalls).toContainEqual({ table: 'games', column: 'id', value: UPPER })
  })

  it.each(trimmed.map((r) => [r.name, r] as const))(
    '%s treats a whitespace-only gameCode as absent',
    async (_n, route) => {
      route.arrange()
      const res = await post(route.handler, route.path, { gameCode: '   ', ...route.playerExtras })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: route.missingError })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )
})

// ---------------------------------------------------------------------------------------------
// The two host-only routes read a SECOND field the same unchecked way (`hostToken?.trim()`, and
// on spotify/search also `q?.trim()`). Same cast, same class of bug, same 500.
// ---------------------------------------------------------------------------------------------

describe('hostToken / q — the same unchecked cast on the host-only routes', () => {
  const hostOnly = [
    { name: 'spotify/search', path: '/api/spotify/search', handler: spotifySearch, fallback: 'Spotify search failed' },
    { name: 'music/control', path: '/api/music/control', handler: musicControl, fallback: 'Music control failed' },
  ] as const

  describe.each(hostOnly.map((r) => [r.name, r] as const))('%s', (_n, route) => {
    it.each(HANDLED_AS_ABSENT)('treats %s hostToken as absent: 400', async (_label, hostToken) => {
      const res = await post(route.handler, route.path, { gameCode: LOWER, hostToken, q: 'abba' })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'gameCode and hostToken are required' })
      expect(fromSpy).not.toHaveBeenCalled()
    })

    // PIN MOVED, same reason as the gameCode rows: these asserted `500` with
    // `route.fallback` against the unchanged routes.
    it.each(NON_STRING)('rejects %s hostToken with 400, no DB', async (_label, hostToken) => {
      const res = await post(route.handler, route.path, { gameCode: LOWER, hostToken, q: 'abba' })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'gameCode and hostToken are required' })
      expect(fromSpy).not.toHaveBeenCalled()
      expect(res.status).not.toBe(500)
    })

    it('treats an absent hostToken as absent: 400', async () => {
      const res = await post(route.handler, route.path, { gameCode: LOWER, q: 'abba' })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'gameCode and hostToken are required' })
      expect(fromSpy).not.toHaveBeenCalled()
    })

    it('rejects a non-string hostToken even when it would not have matched anyway', async () => {
      tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
      const res = await post(route.handler, route.path, { gameCode: LOWER, hostToken: 5, q: 'abba' })
      // Never a 403: the type failure happens before the token is ever compared.
      expect(res.status).not.toBe(403)
    })
  })

  // PIN MOVED. Against the unchanged route a non-string `q` answered 500 'Spotify search
  // failed'. This is the one field whose repaired answer is NOT a 400: /api/spotify/search has
  // no 400 for a bad query — `if (!q) return { tracks: [] }` is its own gate for a query it
  // cannot use, and an unusable `q` now lands there instead of throwing.
  it.each(NON_STRING)('spotify/search: %s q short-circuits to an empty track list, no DB', async (_label, q) => {
    tables = { games: { data: { host_token: HOST_TOKEN }, error: null } }
    const res = await post(spotifySearch, '/api/spotify/search', { gameCode: LOWER, hostToken: HOST_TOKEN, q })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ tracks: [] })
    expect(fromSpy).not.toHaveBeenCalled()
    expect(searchTracksSpy).not.toHaveBeenCalled()
    expect(res.status).not.toBe(500)
  })

  it.each(HANDLED_AS_ABSENT)('spotify/search: %s q short-circuits to an empty track list, no DB', async (_label, q) => {
    const res = await post(spotifySearch, '/api/spotify/search', { gameCode: LOWER, hostToken: HOST_TOKEN, q })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ tracks: [] })
    expect(fromSpy).not.toHaveBeenCalled()
    expect(searchTracksSpy).not.toHaveBeenCalled()
  })

  it('spotify/search: an absent q short-circuits to an empty track list, no DB', async () => {
    const res = await post(spotifySearch, '/api/spotify/search', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ tracks: [] })
    expect(fromSpy).not.toHaveBeenCalled()
    expect(searchTracksSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------
// Downstream branches. The gameCode gate sits above all of these, so each one is a path that
// must still behave identically after the fix.
// ---------------------------------------------------------------------------------------------

describe('downstream branches are untouched', () => {
  const hands = [
    ['crazy-eights/hands', '/api/crazy-eights/hands', crazyEightsHands, 'crazy_eights_player_hands'],
    ['whot/hands', '/api/whot/hands', whotHands, 'whot_player_hands'],
    ['gofish/hands', '/api/gofish/hands', gofishHands, 'gofish_player_hands'],
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  ] as unknown as [string, string, (req: any) => Promise<Response>, string][]

  it.each(hands)(
    '%s: a finished game returns raw hands and never resolves a viewer',
    async (_n, path, handler, table) => {
      tables = {
        games: { data: { status: 'finished' }, error: null },
        [table]: { data: [{ player_id: 'p1', cards: ['a'] }], error: null },
      }
      const res = await post(handler, path, { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ hands: [{ player_id: 'p1', cards: ['a'] }] })
      expect(resolveHandViewerSpy).not.toHaveBeenCalled()
    }
  )

  it.each(hands)('%s: a live game redacts against the resolved viewer', async (_n, path, handler, table) => {
    tables = {
      games: { data: { status: 'live' }, error: null },
      [table]: { data: [{ player_id: 'p1' }], error: null },
    }
    const res = await post(handler, path, { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ hands: [{ redactedFor: 'p1', count: 1 }] })
    expect(resolveHandViewerSpy).toHaveBeenCalledTimes(1)
  })

  it.each(hands)('%s: a DB error is a 500 with the query fallback', async (_n, path, handler, table) => {
    tables = {
      games: { data: { status: 'live' }, error: null },
      [table]: { data: null, error: { message: 'boom' } },
    }
    const res = await post(handler, path, { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Something went wrong. Please try again.' })
  })

  it('bingo/card: an unresolved viewer is a 401', async () => {
    tables = { games: { data: { game_type: 'bingo' }, error: null } }
    resolveHandViewerSpy.mockResolvedValue(null)
    const res = await post(bingoCard, '/api/bingo/card', { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('bingo/card: a non-bingo game is a 400', async () => {
    tables = { games: { data: { game_type: 'whot' }, error: null } }
    const res = await post(bingoCard, '/api/bingo/card', { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a bingo game' })
  })

  it('describe-it/my-word: the host path resolves through the host seat', async () => {
    tables = {
      games: { data: { game_type: 'describe_it', host_token: HOST_TOKEN, host_player_id: 'p1' }, error: null },
      describe_it_sessions: { data: { describer_player_id: 'p1', current_word: 'moon' }, error: null },
      players: { data: null, error: null },
    }
    const res = await post(describeItMyWord, '/api/describe-it/my-word', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ word: 'moon' })
  })

  it('describe-it/my-word: a non-describer gets a null word with a 200', async () => {
    tables = {
      games: { data: { game_type: 'describe_it', host_token: HOST_TOKEN, host_player_id: 'p2' }, error: null },
      describe_it_sessions: { data: { describer_player_id: 'p1', current_word: 'moon' }, error: null },
      players: { data: null, error: null },
    }
    const res = await post(describeItMyWord, '/api/describe-it/my-word', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ word: null })
  })

  it('quick-draw/my-word: the lie variant is a 400', async () => {
    tables = {
      games: { data: { game_type: 'quick_draw', quick_draw_variant: 'lie' }, error: null },
    }
    const res = await post(quickDrawMyWord, '/api/quick-draw/my-word', { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not in guess mode' })
  })

  it('quick-draw/my-word: the host path resolves through the host seat', async () => {
    tables = {
      games: {
        data: {
          game_type: 'quick_draw',
          quick_draw_variant: 'guess',
          host_token: HOST_TOKEN,
          host_player_id: 'p1',
        },
        error: null,
      },
      quick_draw_guess_sessions: { data: { drawer_player_id: 'p1', current_word: 'cat' }, error: null },
      players: { data: null, error: null },
    }
    const res = await post(quickDrawMyWord, '/api/quick-draw/my-word', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ word: 'cat' })
  })

  it('two-truths/my-statement: an authorized player gets their own row', async () => {
    tables = {
      games: { data: { game_type: 'two_truths' }, error: null },
      ttl_statements: { data: { id: 's1' }, error: null },
    }
    assertPlayerSpy.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' } } as never)
    const res = await post(twoTruthsMyStatement, '/api/two-truths/my-statement', {
      gameCode: LOWER,
      resumeToken: PLAYER_TOKEN,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ statement: { id: 's1' } })
  })

  it('two-truths/my-guesses: an authorized player gets their own rows', async () => {
    tables = {
      games: { data: { game_type: 'two_truths' }, error: null },
      ttl_guesses: { data: [{ id: 'g1' }], error: null },
    }
    assertPlayerSpy.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' } } as never)
    const res = await post(twoTruthsMyGuesses, '/api/two-truths/my-guesses', {
      gameCode: LOWER,
      resumeToken: PLAYER_TOKEN,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ guesses: [{ id: 'g1' }] })
  })

  it('spotify/search: a wrong host token is a 403', async () => {
    tables = { games: { data: { host_token: 'other' }, error: null } }
    const res = await post(spotifySearch, '/api/spotify/search', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      q: 'abba',
    })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('spotify/search: a missing game is a 404', async () => {
    tables = { games: { data: null, error: null } }
    const res = await post(spotifySearch, '/api/spotify/search', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      q: 'abba',
    })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('music/control: a session patch is upserted under the upper-cased code', async () => {
    tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
    const res = await post(musicControl, '/api/music/control', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      musicEnabled: true,
      session: { track_uri: 'spotify:track:1', is_playing: true, position_ms: 10 },
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(writes.map((w) => `${w.table}:${w.op}`)).toEqual(['games:update', 'music_sessions:upsert'])
    expect((writes[1].payload as { game_id: string }).game_id).toBe(UPPER)
  })

  it('music/control: a null session deletes the row', async () => {
    tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
    const res = await post(musicControl, '/api/music/control', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      session: null,
    })
    expect(res.status).toBe(200)
    expect(writes.map((w) => `${w.table}:${w.op}`)).toEqual(['music_sessions:delete'])
  })

  it('music/control: a wrong host token is a 403 and writes nothing', async () => {
    tables = { games: { data: { id: UPPER, host_token: 'other' }, error: null } }
    const res = await post(musicControl, '/api/music/control', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      musicEnabled: true,
    })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// codewords/board's `resumeToken` — the same class, reached through `??` rather than `?.`.
//
// `normalizeResumeToken(body.resumeToken ?? '')` (route line 72) guards NULLISH only, and
// `normalizeResumeToken` (src/lib/utils.ts:52) starts with `raw.trim()`, so any non-string threw
// and the handler catch answered 500. Its siblings already defend this — describe-it/my-word:76
// and quick-draw/my-word:81 both wrap the value in `String(...)`; this was the lone omission.
//
// Unlike the gameCode rows the repaired answer is NOT a 400: this route has no resumeToken gate
// to fall into. A non-string is treated as absent, which is exactly what `''` and any token
// under four characters already do — the spymaster branch is skipped, `maySeeKey` stays false,
// and the caller gets a 200 with the key masked. Same reasoning as spotify/search's `q`.
// ---------------------------------------------------------------------------------------------

describe('codewords/board — resumeToken type matrix', () => {
  const BOARD = { id: 'b1', key: ['red', 'blue', 'assassin'], revealed_indices: [0] }
  /** Masked: revealed cells survive, unrevealed become null. */
  const MASKED = {
    board: { ...BOARD, key: ['red', null, null], key_totals: { red: 1, blue: 1, assassin: 1 } },
  }
  const UNMASKED = { board: { ...BOARD, key_totals: { red: 1, blue: 1, assassin: 1 } } }

  /** A live game whose host token is HOST_TOKEN, with a board dealt. */
  function arrangeLive(playerRow: unknown = null, role: unknown = null) {
    tables = {
      codewords_boards: { data: BOARD, error: null },
      games: { data: { status: 'live', host_token: HOST_TOKEN }, error: null },
      players: { data: playerRow, error: null },
      codewords_player_roles: { data: role, error: null },
    }
  }

  it.each(NON_STRING)('treats %s resumeToken as absent: 200 with the key masked', async (_label, resumeToken) => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, resumeToken })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
    // The spymaster lookup is skipped entirely — no players query is issued.
    expect(eqCalls.some((c) => c.table === 'players')).toBe(false)
    expect(res.status).not.toBe(500)
  })

  it.each(HANDLED_AS_ABSENT)('treats %s resumeToken as absent: 200 with the key masked', async (_l, resumeToken) => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, resumeToken })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
    expect(eqCalls.some((c) => c.table === 'players')).toBe(false)
  })

  it('treats an absent resumeToken as absent: 200 with the key masked', async () => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
    expect(eqCalls.some((c) => c.table === 'players')).toBe(false)
  })

  // A token under four characters is the existing "unusable token" case a non-string now joins.
  it('treats a too-short resumeToken as absent: 200 with the key masked', async () => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, resumeToken: 'ab' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
    expect(eqCalls.some((c) => c.table === 'players')).toBe(false)
  })

  // --- the paths a real token still reaches, unchanged --------------------------------------

  it('still unmasks the key for a spymaster', async () => {
    arrangeLive({ id: 'p1' }, { role: 'spymaster' })
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(UNMASKED)
    expect(eqCalls).toContainEqual({ table: 'players', column: 'resume_token', value: PLAYER_TOKEN })
  })

  it('still masks the key for a non-spymaster operative', async () => {
    arrangeLive({ id: 'p1' }, { role: 'operative' })
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, resumeToken: PLAYER_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
  })

  it('still unmasks the key for the host', async () => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(UNMASKED)
  })

  it('still unmasks the key for everyone once the game is finished', async () => {
    arrangeLive()
    tables.games = { data: { status: 'finished', host_token: HOST_TOKEN }, error: null }
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(UNMASKED)
  })

  // `hostToken` here reaches secretMatches -> timingSafeEqual -> TextEncoder.encode(), which
  // applies ToString and therefore cannot throw — so it needs no guard, and that is the only
  // claim this block makes. `@/lib/secret-compare` is deliberately NOT mocked in this file, so
  // these rows exercise the real digest comparison.
  //
  // It would be wrong to also claim "a non-string is never a match": ToString means a
  // one-element array UNWRAPS to its element, so `['<the token>']` does match. That is not a
  // privilege escalation — you must already know the token — but it is surprising enough to
  // pin explicitly rather than leave a comment asserting the opposite.
  it.each(NON_STRING)('a %s hostToken does not throw, and does not match', async (_label, hostToken) => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, hostToken })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(MASKED)
  })

  it('a single-element array hostToken DOES match, because TextEncoder applies ToString', async () => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, hostToken: [HOST_TOKEN] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(UNMASKED)
  })

  it('a string hostToken still matches, through the real secretMatches', async () => {
    arrangeLive()
    const res = await post(codewordsBoard, '/api/codewords/board', { gameCode: LOWER, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(UNMASKED)
  })
})

// ---------------------------------------------------------------------------------------------
// A JSON body of literal `null`. `req.json()` PARSES that successfully to `null`, so the
// `.catch(() => ({}))` never fires and `body.gameCode` throws "Cannot read properties of null"
// one step EARLIER than the typeof guards above can help. Same defect class, same swallow,
// same spurious 500 — on every route in this file.
// ---------------------------------------------------------------------------------------------

describe('a literal `null` JSON body', () => {
  /** Bypasses the object-only `post` helper so a raw `null` document can be sent. */
  function postRaw(route: RouteCase, raw: string) {
    return route.handler(
      new Request(`http://localhost${route.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      }) as any
    )
  }

  // PIN MOVED. Against the unchanged routes every row here asserted `500` with
  // `route.catchFallback`. That 500 was the defect; a `null` body now answers the same
  // missing-field 400 that a malformed body, a scalar body and an array body already did.
  it.each(ROUTES.map((r) => [r.name, r] as const))('%s answers the missing-field 400', async (_n, route) => {
    route.arrange()
    const res = await postRaw(route, 'null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: route.missingError })
    expect(res.status).not.toBe(500)
  })

  // Neighbours that already behave correctly, pinned so the fix cannot disturb them.
  it.each(ROUTES.map((r) => [r.name, r] as const))('%s: malformed JSON is already a 400', async (_n, route) => {
    route.arrange()
    const res = await postRaw(route, '{not json')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: route.missingError })
  })

  it.each(ROUTES.map((r) => [r.name, r] as const))('%s: a JSON scalar body is already a 400', async (_n, route) => {
    route.arrange()
    const res = await postRaw(route, '5')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: route.missingError })
  })

  it.each(ROUTES.map((r) => [r.name, r] as const))('%s: a JSON array body is already a 400', async (_n, route) => {
    route.arrange()
    const res = await postRaw(route, '[]')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: route.missingError })
  })
})

// ---------------------------------------------------------------------------------------------
// music/control's `position_ms`. `Math.max(0, Math.round(s.position_ms ?? 0))` is the same `??`
// shape: it does not throw, but a non-numeric value yields NaN, which serializes to JSON `null`
// — and `music_sessions.position_ms` is `integer NOT NULL default 0`
// (supabase/migrations/20260705130000_spotify_music.sql:30). A default does not cover an
// EXPLICIT null, so the insert violates NOT NULL and the route answers 500: the same symptom.
// `duration_ms`, one line above, already has a typeof guard; this one does not.
// ---------------------------------------------------------------------------------------------

describe('music/control position_ms', () => {
  function patch(position_ms: unknown) {
    tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
    return post(musicControl, '/api/music/control', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      session: { track_uri: 'spotify:track:1', is_playing: true, position_ms },
    })
  }
  const written = () => (writes.find((w) => w.op === 'upsert')?.payload as { position_ms: number }).position_ms

  it.each([
    ['a number', 5, 5],
    ['a numeric string', '7', 7],
    ['true', true, 1],
    ['false', false, 0],
    ['null', null, 0],
    ['a negative number', -20, 0],
    ['a fractional number', 10.6, 11],
    // ToNumber unwraps a one-element array, so this is a number, not NaN.
    ['a single-element numeric array', ['5'], 5],
  ])('writes %s as %s', async (_label, value, expected) => {
    await patch(value)
    expect(written()).toBe(expected)
  })

  it('writes an absent position_ms as 0', async () => {
    tables = { games: { data: { id: UPPER, host_token: HOST_TOKEN }, error: null } }
    await post(musicControl, '/api/music/control', {
      gameCode: LOWER,
      hostToken: HOST_TOKEN,
      session: { track_uri: 'spotify:track:1' },
    })
    expect(written()).toBe(0)
  })

  // PIN MOVED. Against the unchanged route these rows asserted NaN, which serializes to an
  // explicit JSON null and fails the NOT NULL constraint as a 500. They now assert the column
  // default, which is what every other unusable value already writes.
  it.each([
    ['an object', {}],
    ['a multi-element array', ['5', '6']],
    ['a non-numeric string', 'abc'],
  ])('writes the column default for %s instead of a NOT NULL violation', async (_label, value) => {
    await patch(value)
    expect(written()).toBe(0)
    expect(written()).not.toBeNaN()
    expect(JSON.parse(JSON.stringify({ p: written() })).p).toBe(0)
  })
})
