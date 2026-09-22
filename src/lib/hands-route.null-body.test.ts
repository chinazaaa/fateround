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
 * The matrix runs PAST the gates, not into them: the rate limiter is stubbed to allow, and
 * the real `resolveHandViewer` resolves a real player row off the PostgREST stub, so the
 * valid rows assert redacted hands and not an auth short-circuit.
 */

const { rateLimitSpy, rpcSpy, fromSpy } = vi.hoisted(() => ({
  rateLimitSpy: vi.fn(async () => null),
  rpcSpy: vi.fn(),
  fromSpy: vi.fn(),
}))

vi.mock('server-only', () => ({}))

// Only `enforceRateLimit` is replaced. `RATE_LIMITS` stays the REAL table, so
// `RATE_LIMITS.handsFetch` is the genuine `{ bucket, max, windowSeconds }` rule and a rename
// or removal of that key breaks this file instead of silently passing against a fake shape.
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, enforceRateLimit: rateLimitSpy }
})

// `@/lib/hand-redaction` is NOT mocked: `resolveHandViewer` runs for real against the stub
// below (so the resume-token lookup is genuinely exercised) and `redactHands` is pure.
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

const PLAYER_TOKEN = 'AAAA1111BBBB2222'

/**
 * Every consumer of the factory. `uno/hands` is the only one in the tree today; the second
 * entry drives the factory directly with no `extraViewerIds`, which is the shape Crazy Eights
 * and Bingo will join with (docs/rls-hardening.md § "Phase 7"), and proves the body read is
 * the factory's and not UNO's.
 */
const plainHands = createHandsRoute({ table: 'whot_player_hands', tag: 'plain/hands' })

const CONSUMERS: { name: string; path: string; handler: (req: never) => Promise<Response>; table: string }[] = [
  { name: 'POST /api/uno/hands', path: '/api/uno/hands', handler: unoHands as never, table: 'uno_player_hands' },
  {
    name: 'createHandsRoute (no extraViewerIds)',
    path: '/api/plain/hands',
    handler: plainHands as never,
    table: 'whot_player_hands',
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
const OK = {
  status: 200,
  body: {
    hands: [
      { player_id: 'p1', cards: ['A', 'B'], card_count: 2 },
      { player_id: 'p2', cards: null, card_count: 1 },
    ],
  },
}

type Row = { label: string; raw: string; expected: { status: number; body: unknown }; pastGates?: boolean }

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

function seed(table: string) {
  tables = {
    games: { data: { status: 'playing', uno_team_mode: false }, error: null },
    players: { data: { id: 'p1' }, error: null },
    uno_sessions: { data: { turn_order: ['p1', 'p2'] }, error: null },
    [table]: {
      data: [
        { player_id: 'p1', cards: ['A', 'B'] },
        { player_id: 'p2', cards: ['C'] },
      ],
      error: null,
    },
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
          seed(consumer.table)
          const res = await postRaw(consumer.handler as never, consumer.path, body.raw)
          const json = await res.json()

          expect({ status: res.status, body: json }).toEqual(body.expected)

          if (body.pastGates) {
            // PAST the gates, not into them: the rate limiter ran and allowed, the code was
            // upper-cased for the lookup, and the real resolveHandViewer matched the resume
            // token against the players table — so the 200 is redacted hands, not a
            // short-circuit that happens to be shaped like success.
            expect(rateLimitSpy).toHaveBeenCalledTimes(1)
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
