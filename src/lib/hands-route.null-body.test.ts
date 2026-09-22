import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Characterization matrix for the request body of `createHandsRoute` — the shared
 * `POST /api/<game>/hands` factory in lib/hands-route.ts.
 *
 *     const body = (await req.json().catch(() => ({}))) as { gameCode?: string; ... }
 *     const gameId = body.gameCode?.toUpperCase()
 *
 * `req.json()` PARSES a literal `null` body successfully, so the `.catch` never fires and
 * `body` is `null`. The `?.` guards `gameCode`, not `body`, so `body.gameCode` throws a
 * TypeError inside the handler's outer `try` — answered as a 500 "Failed to load hands"
 * where the 400 "gameCode is required" that `{}`, `5`, `"str"`, `[]` and a malformed body
 * already get is correct.
 *
 * The same defect was fixed in the eleven hand-written routes of #1187 with `?? {}` — three
 * of which (whot, crazy-eights, gofish) are hand-written siblings of this very route. UNO
 * was missed because its route.ts only names its table; the body read lives here in
 * `src/lib/`, outside the `src/app/api/` tree that sweep walked.
 *
 * Only the `null` row may move. `{}`, malformed, empty, `5`, `"str"`, `[]`, valid and
 * valid-but-missing-gameCode are pinned byte-identical before and after, because a
 * schema-level guard here would turn requests these routes answer today into a different
 * 400 (CONTRIBUTING.md — #1163 / #1153).
 *
 * The matrix runs PAST the gates, not into them: the rate limiter is stubbed to allow (but
 * still checked against the genuine `handsFetch` rule), and `@/lib/hand-redaction` is left
 * unmocked so the real `resolveHandViewer` and `redactHands` produce the `valid` rows' body —
 * which is asserted as actually redacted, not merely success-shaped.
 */

const { rateLimitSpy, rpcSpy, fromSpy } = vi.hoisted(() => ({
  rateLimitSpy: vi.fn(async () => null),
  rpcSpy: vi.fn(),
  fromSpy: vi.fn(),
}))

vi.mock('server-only', () => ({}))

// Only `enforceRateLimit` is replaced; the rest of the module is passed through.
//
// The `valid` rows assert the route asked for the genuine `handsFetch` rule, compared against
// `vi.importActual` — NOT against the mocked module. Importing the constant from the mock would
// fake both sides of the comparison at once and pass against any lie; importActual bypasses the
// mock, so a route swapped onto a different bucket fails here.
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, enforceRateLimit: rateLimitSpy }
})

// `@/lib/hand-redaction` is NOT mocked. The real `resolveHandViewer` runs against the stub
// below — the stub ignores `.eq()` filters, so what that pins is the token being forwarded as
// the filter value, not a row genuinely matching it — and the real `redactHands` (pure)
// produces the response body, so the `valid` rows assert actual redaction.
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy, rpc: rpcSpy }) }))

// ---------------------------------------------------------------------------------------------
// A minimal PostgREST-shaped stub, same shape as the one in
// src/app/api/gamecode-json-type.test.ts. `tables` says what each table answers; `eqCalls`
// records the filters so the normalised (upper-cased) game code is observable.
// ---------------------------------------------------------------------------------------------

type Result = { data: unknown; error: unknown }
let tables: Record<string, Result> = {}
let eqCalls: { table: string; column: string; value: unknown }[] = []

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
    maybeSingle: async () => answer(table),
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(answer(table)).then(onFulfilled, onRejected),
  }
  return chain
}

/** POST a RAW body string — not `JSON.stringify(x)`, which cannot express malformed or empty. */
function postRaw(handler: (req: any) => Promise<Response>, path: string, raw: string) {
  return handler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    }) as any
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { createHandsRoute } from './hands-route'
import { POST as unoHands } from '@/app/api/uno/hands/route'

/** The real rule, read past the mock — see the note on the rate-limit mock above. */
const { RATE_LIMITS: REAL_RATE_LIMITS } = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')

const PLAYER_TOKEN = 'AAAA1111BBBB2222'

/**
 * Every consumer of the factory, in its two genuinely distinct shapes.
 *
 * `uno/hands` is the only one in the tree today, and it is the WITH-`extraViewerIds` shape: the
 * fixture below turns Team-Up on over a four-seat `turn_order`, so `unoTeammateId` really
 * resolves p1's partner (p3) and the 200 shows TWO unredacted hands. The second entry drives
 * the factory directly with no `extraViewerIds` — the shape Crazy Eights and Bingo will join
 * with (docs/rls-hardening.md § "Phase 7") — and its 200 shows exactly one. The two expected
 * bodies differ, so neither consumer can be deleted without a failure.
 */
const plainHands = createHandsRoute({ table: 'whot_player_hands', tag: 'plain/hands' })

const HAND_ROWS = [
  { player_id: 'p1', cards: ['A', 'B'] },
  { player_id: 'p2', cards: ['C'] },
  { player_id: 'p3', cards: ['D', 'E', 'F'] },
  { player_id: 'p4', cards: [] },
]

/** `cards` in full for the viewer set, null for everyone else; `card_count` always survives. */
function expectHands(...unredacted: string[]) {
  return {
    status: 200,
    body: {
      hands: HAND_ROWS.map((r) => ({
        player_id: r.player_id,
        cards: unredacted.includes(r.player_id) ? r.cards : null,
        card_count: r.cards.length,
      })),
    },
  }
}

type Consumer = {
  name: string
  path: string
  handler: (req: never) => Promise<Response>
  table: string
  /** Extra columns the `games` row must carry for this consumer. */
  game: Record<string, unknown>
  ok: { status: number; body: unknown }
}

const CONSUMERS: Consumer[] = [
  {
    name: 'POST /api/uno/hands',
    path: '/api/uno/hands',
    handler: unoHands as never,
    table: 'uno_player_hands',
    // Team-Up ON, so UNO's extraViewerIds callback actually runs and adds the teammate.
    game: { uno_team_mode: true },
    ok: expectHands('p1', 'p3'),
  },
  {
    name: 'createHandsRoute (no extraViewerIds)',
    path: '/api/plain/hands',
    handler: plainHands as never,
    table: 'whot_player_hands',
    game: {},
    ok: expectHands('p1'),
  },
]

/**
 * The nine body shapes, as the exact bytes that go on the wire, each with the `{status, body}`
 * it must answer with.
 *
 * `MISSING` is the 400 gate — reached as the handler's first statement, before the rate limiter
 * and before any Supabase call. Eight of these nine rows are pinned to it and MUST NOT MOVE.
 *
 * ┌─────────────────────────┬────────────────────────────┬────────────────────────────┐
 * │ body                    │ before the fix             │ after the fix              │
 * ├─────────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ null            ← MOVED │ 500 Failed to load hands   │ 400 gameCode is required   │
 * │ {}                      │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ malformed  `{`          │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ empty      ``           │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ scalar     `5`          │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ scalar     `"str"`      │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ array      `[]`         │ 400 gameCode is required   │ 400 gameCode is required   │
 * │ valid                   │ 200 redacted hands         │ 200 redacted hands         │
 * │ valid, gameCode missing │ 400 gameCode is required   │ 400 gameCode is required   │
 * └─────────────────────────┴────────────────────────────┴────────────────────────────┘
 */
const MISSING = { status: 400, body: { error: 'gameCode is required' } }
/** Sentinel: the `valid` row's expectation is the per-consumer `ok` above, not a shared one. */
const OK = null

type Row = { label: string; raw: string; expected: { status: number; body: unknown } | null; pastGates?: boolean }

const BODIES: Row[] = [
  // PIN MOVED (the one row this change touches). Before the fix this row read
  // `{ status: 500, body: { error: 'Failed to load hands' } }` — the TypeError from reading
  // `.gameCode` off a null body, swallowed by the handler's outer try.
  { label: 'null', raw: 'null', expected: MISSING },
  { label: 'empty object', raw: '{}', expected: MISSING },
  { label: 'malformed', raw: '{', expected: MISSING },
  { label: 'empty', raw: '', expected: MISSING },
  { label: 'scalar number', raw: '5', expected: MISSING },
  { label: 'scalar string', raw: '"str"', expected: MISSING },
  { label: 'array', raw: '[]', expected: MISSING },
  {
    label: 'valid',
    raw: JSON.stringify({ gameCode: 'abcd', resumeToken: PLAYER_TOKEN }),
    expected: OK,
    pastGates: true,
  },
  { label: 'valid, gameCode missing', raw: JSON.stringify({ resumeToken: PLAYER_TOKEN }), expected: MISSING },
]

function seed(consumer: Consumer) {
  tables = {
    games: { data: { status: 'playing', ...consumer.game }, error: null },
    players: { data: { id: 'p1' }, error: null },
    // Four seats, so `unoTeammateId` has a same-parity partner to find for p1 (p3). A
    // two-seat order would silently return null and make UNO indistinguishable from the
    // no-extraViewerIds consumer.
    uno_sessions: { data: { turn_order: ['p1', 'p2', 'p3', 'p4'] }, error: null },
    [consumer.table]: { data: HAND_ROWS, error: null },
  }
}

describe('createHandsRoute — request body matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitSpy.mockResolvedValue(null)
    fromSpy.mockImplementation(makeChain)
    eqCalls = []
  })

  for (const consumer of CONSUMERS) {
    describe(consumer.name, () => {
      for (const body of BODIES) {
        it(`${body.label} body`, async () => {
          seed(consumer)
          const res = await postRaw(consumer.handler as never, consumer.path, body.raw)
          const json = await res.json()

          expect({ status: res.status, body: json }).toEqual(body.expected ?? consumer.ok)

          if (body.pastGates) {
            // PAST the gates, not into them. The rate limiter ran and was asked for the REAL
            // handsFetch rule; the game code was upper-cased for the lookup; the real
            // resolveHandViewer forwarded the resume token as the `players` filter; and the
            // real redactHands produced the body — so the 200 asserted above is genuinely
            // redacted hands, not a short-circuit that happens to be shaped like success.
            //
            // The stub answers by table name and ignores `.eq()` filters, so this pins that
            // the token was passed as the filter value, not that a row matched it.
            expect(rateLimitSpy).toHaveBeenCalledTimes(1)
            expect(rateLimitSpy).toHaveBeenCalledWith(expect.anything(), REAL_RATE_LIMITS.handsFetch)
            expect(eqCalls).toContainEqual({ table: 'players', column: 'resume_token', value: PLAYER_TOKEN })
            expect(eqCalls).toContainEqual({ table: consumer.table, column: 'game_id', value: 'ABCD' })
          } else {
            // Refused at the FIRST gate — before the rate limiter and before any Supabase call.
            expect(rateLimitSpy).not.toHaveBeenCalled()
            expect(eqCalls).toEqual([])
          }
        })
      }
    })
  }
})
