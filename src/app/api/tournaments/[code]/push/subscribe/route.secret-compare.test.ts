import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOURNAMENT_CODE,
  TOURNAMENT_ID,
  HOST_TOKEN,
  PLAYER_ID,
  tournamentRow,
  jsonRequest,
  codeParams,
  makeSupabaseStub,
} from '@/test-support/tournament-host-auth'

/**
 * Characterization of the host-token comparison in POST /api/tournaments/[code]/push/subscribe.
 *
 * Written against the ORIGINAL `hostToken && hostToken === tournament.host_token` and
 * re-run unmodified against the `secretMatches(...)` swap.
 *
 * This site differs from the other two in the sweep: the token is not only COMPARED, it is
 * INTERPOLATED into the value that gets written to the database —
 *
 *     roleKey = `host:${hostToken}`
 *
 * — and `role_key` is a persisted column that `notifyTournamentEvent` later parses
 * (`src/lib/tournament-push.ts`), though only for the `player:` prefix; a `host:` key just
 * means "not a player". So the swap must leave TWO things alone, and both are pinned below:
 *
 *   1. WHEN the host branch is taken (the comparison's answer), and
 *   2. WHAT it writes — the exact `role_key` string in the upsert payload, asserted
 *      literally as `host:<token>`, not merely "starts with host:".
 *
 * `hostToken` is `z.string().trim().min(4).max(100).optional()`, so by the time it reaches
 * either the comparison or the template it is already a trimmed non-empty string. That is
 * why the interpolation cannot change: the swap does not touch the variable, and no
 * non-string can reach the template (a number or array is a 400 from the schema, pinned
 * below) — so there is no `host:[object Object]` / `host:12345` shape to preserve or lose.
 *
 * It is also why the one behaviour delta #1193 found — `'' === ''` authorising where
 * `secretMatches` refuses — is UNREACHABLE here: `min(4)` rejects an empty supplied token
 * with 400 before the comparison, and the `!resumeToken && !hostToken` gate above would
 * have 400'd it anyway.
 *
 * Gate ladder, in order:
 *   1. body fails the schema        → 400 { error: <first issue message> }
 *   2. neither token supplied       → 400 { error: 'Missing resumeToken or hostToken' }
 *   3. tournament row missing       → 404 { error: 'Tournament not found' }
 *   4. host compare, else player lookup; no roleKey → 403 { error: 'Unauthorized' }
 *   5. upsert failure               → 500 { error: 'Failed to save subscription' }
 *
 * `@/lib/secret-compare` is WRAPPED, never substituted — see `compareCalls` below.
 */

/**
 * A FAITHFUL wrapper around `@/lib/secret-compare`, not a substitute for it: it awaits the
 * REAL `secretMatches` and only records the call. It decides nothing, so it cannot lie
 * about what matches — in particular it cannot claim a non-string never matches, when in
 * fact `TextEncoder.encode` applies ToString and `['<token>']` encodes as `'<token>'`.
 *
 * It exists because the swap at this site is observationally IDENTICAL — every status,
 * body and `role_key` pinned above is the same under `===` and under `secretMatches`,
 * which is the point. A behavioural test therefore cannot tell the two apart, so this
 * records the mechanism: that the constant-time helper is the thing being called, with the
 * supplied token first and the stored one second, and that it is NOT called when a guard
 * short-circuits first.
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

const ENDPOINT = 'https://push.example.com/endpoint/abc123'
const SUBSCRIPTION = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }

let tournament: Record<string, unknown> | null = tournamentRow()
let upserts: { payload: unknown; options: unknown }[] = []
let upsertError: unknown = null
let lookupCalls: { tournamentId: string; rawToken: string }[] = []
let lookupPlayerId: string | null = PLAYER_ID

const supabase = makeSupabaseStub({
  tournaments: () => ({ data: tournament, error: null }),
  tournament_push_subscriptions: ({ op, payload }) => {
    if (op === 'upsert') {
      upserts.push({ payload, options: undefined })
      return { data: null, error: upsertError }
    }
    return { data: null, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/tournament-token-lookup', () => ({
  resolveTournamentPlayerId: async (_admin: unknown, tournamentId: string, rawToken: string) => {
    lookupCalls.push({ tournamentId, rawToken })
    return { playerId: lookupPlayerId, token: rawToken, error: false }
  },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  compareCalls.length = 0
  tournament = tournamentRow()
  upserts = []
  upsertError = null
  lookupCalls = []
  lookupPlayerId = PLAYER_ID
})

const post = (body: unknown) =>
  POST(jsonRequest(`/api/tournaments/${TOURNAMENT_CODE}/push/subscribe`, body), codeParams(TOURNAMENT_CODE))

/** The single upsert payload, narrowed to the fields this route composes. */
const upsertPayload = () => {
  expect(upserts).toHaveLength(1)
  return upserts[0].payload as Record<string, unknown>
}

describe('POST /api/tournaments/[code]/push/subscribe — host-token branch', () => {
  it('authorizes the CORRECT host token with 200 { ok: true } and never looks up a player', async () => {
    const res = await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(lookupCalls).toEqual([])
  })

  it('rejects a WRONG host token with 403 Unauthorized when no resumeToken is offered', async () => {
    const res = await post({ hostToken: 'completely-different', subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(upserts).toEqual([])
  })

  it('rejects a wrong host token of the SAME LENGTH with 403', async () => {
    const sameLength = 'z'.repeat(HOST_TOKEN.length)
    expect(sameLength).toHaveLength(HOST_TOKEN.length)
    const res = await post({ hostToken: sameLength, subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects a strict PREFIX of the correct host token with 403', async () => {
    const res = await post({ hostToken: HOST_TOKEN.slice(0, -1), subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects a token the correct one is a prefix OF with 403', async () => {
    const res = await post({ hostToken: `${HOST_TOKEN}x`, subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('refuses a correct-looking token when the stored host_token is NULL', async () => {
    tournament = tournamentRow({ host_token: null })
    const res = await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('refuses a supplied token when the stored host_token is an EMPTY STRING', async () => {
    tournament = tournamentRow({ host_token: '' })
    const res = await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})

describe('POST /api/tournaments/[code]/push/subscribe — the role_key the host branch writes', () => {
  it('writes role_key EXACTLY `host:<token>` alongside the subscription fields', async () => {
    await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(upsertPayload()).toEqual({
      tournament_id: TOURNAMENT_ID,
      role_key: `host:${HOST_TOKEN}`,
      endpoint: ENDPOINT,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
  })

  it('writes the TRIMMED token into role_key, because the schema trims before either use', async () => {
    // `z.string().trim()` runs first, so the compared value and the interpolated value are
    // the same trimmed string — surrounding whitespace never reaches the database.
    await post({ hostToken: `  ${HOST_TOKEN}  `, subscription: SUBSCRIPTION })
    expect(upsertPayload().role_key).toBe(`host:${HOST_TOKEN}`)
  })

  it('writes role_key `player:<id>` when the PLAYER branch authorizes instead', async () => {
    const res = await post({ resumeToken: 'player-resume-token', subscription: SUBSCRIPTION })
    expect(res.status).toBe(200)
    expect(upsertPayload().role_key).toBe(`player:${PLAYER_ID}`)
    expect(lookupCalls).toEqual([{ tournamentId: TOURNAMENT_ID, rawToken: 'player-resume-token' }])
  })

  it('falls through to the PLAYER branch when the host token is wrong but a resumeToken is present', async () => {
    const res = await post({ hostToken: 'wrong-token', resumeToken: 'player-resume-token', subscription: SUBSCRIPTION })
    expect(res.status).toBe(200)
    expect(upsertPayload().role_key).toBe(`player:${PLAYER_ID}`)
  })

  it('is 403 when the host token is wrong AND the player lookup finds nobody', async () => {
    lookupPlayerId = null
    const res = await post({ hostToken: 'wrong-token', resumeToken: 'nobody', subscription: SUBSCRIPTION })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(upserts).toEqual([])
  })

  it('the CORRECT host token wins over a resumeToken: role_key is the host one, no lookup', async () => {
    await post({ hostToken: HOST_TOKEN, resumeToken: 'player-resume-token', subscription: SUBSCRIPTION })
    expect(upsertPayload().role_key).toBe(`host:${HOST_TOKEN}`)
    expect(lookupCalls).toEqual([])
  })
})

describe('POST /api/tournaments/[code]/push/subscribe — the comparison is the constant-time one', () => {
  it('calls secretMatches(supplied, stored) for a supplied host token, right or wrong', async () => {
    await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    await post({ hostToken: 'wrong-token-entirely', subscription: SUBSCRIPTION })
    expect(compareCalls).toEqual([
      { supplied: HOST_TOKEN, stored: HOST_TOKEN, result: true },
      { supplied: 'wrong-token-entirely', stored: HOST_TOKEN, result: false },
    ])
  })

  it('does NOT call secretMatches when only a resumeToken is supplied (the short-circuit holds)', async () => {
    await post({ resumeToken: 'player-resume-token', subscription: SUBSCRIPTION })
    expect(compareCalls).toEqual([])
  })

  it('does NOT call secretMatches when the 404 gate fires first', async () => {
    tournament = null
    await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/tournaments/[code]/push/subscribe — the schema rejects bad tokens before the comparison', () => {
  it('rejects an EMPTY-STRING host token with 400 (min(4)), never reaching the comparison', async () => {
    const res = await post({ hostToken: '', subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
    expect(upserts).toEqual([])
  })

  it('rejects a NULL host token with 400, never reaching the comparison', async () => {
    const res = await post({ hostToken: null, subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('rejects a NON-STRING (number) host token with 400, never reaching the comparison', async () => {
    const res = await post({ hostToken: 12345, subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('rejects an ARRAY-WRAPPED correct host token with 400, never reaching the comparison', async () => {
    // Load-bearing twice over: `secretMatches` encodes via ToString, so
    // `['tournament-host-correct']` would digest-match the stored token — AND the template
    // would then persist `host:tournament-host-correct` from a non-string. The zod schema
    // is what stops both.
    const res = await post({ hostToken: [HOST_TOKEN], subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
    expect(upserts).toEqual([])
  })

  it('rejects a host token shorter than 4 characters with 400', async () => {
    const res = await post({ hostToken: 'abc', subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })
})

describe('POST /api/tournaments/[code]/push/subscribe — gates outranking the comparison', () => {
  it('returns 400 "Missing resumeToken or hostToken" when neither is supplied', async () => {
    const res = await post({ subscription: SUBSCRIPTION })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing resumeToken or hostToken' })
    expect(compareCalls).toEqual([])
  })

  it('returns 400 when the subscription block is missing, before any lookup', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('treats a malformed body as {} and 400s on the missing subscription', async () => {
    const res = await POST(
      jsonRequest(`/api/tournaments/${TOURNAMENT_CODE}/push/subscribe`, 'nope'),
      codeParams(TOURNAMENT_CODE)
    )
    expect(res.status).toBe(400)
    expect(compareCalls).toEqual([])
  })

  it('returns 404 when the tournament is missing, even with the CORRECT token', async () => {
    tournament = null
    const res = await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Tournament not found' })
    expect(upserts).toEqual([])
  })

  it('returns 500 when the upsert fails for an authorized host', async () => {
    upsertError = { message: 'db down' }
    const res = await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to save subscription' })
  })

  it('uppercases the code into tournament_id on the written row', async () => {
    await post({ hostToken: HOST_TOKEN, subscription: SUBSCRIPTION })
    expect(upsertPayload().tournament_id).toBe(TOURNAMENT_CODE.toUpperCase())
  })
})
