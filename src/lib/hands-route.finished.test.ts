import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `createHandsRoute`'s "this game is over, stop redacting" decision.
 *
 * The factory de-redacts on `games.status === 'finished'`, which is right for Whot, UNO, Crazy
 * Eights and Bingo — all four gate their finished screen on `games.status` alone. Rummy does not:
 * `RummyPlayerView`/`RummyHostView` show it on `rummy_sessions.phase === 'finished'` OR
 * `games.status === 'finished'`, while `finishRummyGame` writes the session phase FIRST and flips
 * `games.status` second (and `src/lib/rummy.ts` handles the second write failing).
 *
 * Between those two writes, `games.status` is still `active` while the views are already showing
 * final standings. Built from redacted rows, `buildRummyStandings` reads `cards ?? []` and reports
 * every opponent at 0 cards / 0 points, and `rummyPlacementOrder` ranks them on the same empty
 * arrays — so the podium is wrong, not just the counts. Normally a sub-second flash; permanent if
 * the second write fails. That is what `alsoFinished` closes, and these tests pin it.
 */
const { rateLimitSpy, fromSpy } = vi.hoisted(() => ({
  rateLimitSpy: vi.fn(async () => null),
  fromSpy: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, enforceRateLimit: rateLimitSpy }
})
// `@/lib/hand-redaction` is left unmocked so the real redactHands produces the body — the
// assertions below are about genuine redaction, not a success-shaped stub.
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

type Result = { data: unknown; error: unknown }
let tables: Record<string, Result> = {}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeChain(table: string): any {
  const chain: any = {
    select: () => chain,
    order: () => chain,
    eq: () => chain,
    maybeSingle: async () => tables[table] ?? { data: null, error: null },
    then: (ok: any, err: any) => Promise.resolve(tables[table] ?? { data: null, error: null }).then(ok, err),
  }
  return chain
}

function post(handler: (req: any) => Promise<Response>, body: unknown) {
  return handler(
    new Request('http://localhost/api/rummy/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { POST as rummyHands } from '@/app/api/rummy/hands/route'

const MY_TOKEN = 'AAAA1111BBBB2222'

/** Two seats: the caller, and an opponent whose cards must not leak while the game is live. */
function seedHands() {
  tables['rummy_player_hands'] = {
    data: [
      { id: 'h1', game_id: 'ABCD', player_id: 'me', cards: [{ id: 'c1' }], player_order: 0 },
      { id: 'h2', game_id: 'ABCD', player_id: 'them', cards: [{ id: 'c2' }, { id: 'c3' }], player_order: 1 },
    ],
    error: null,
  }
  tables['players'] = { data: { id: 'me' }, error: null }
}

beforeEach(() => {
  tables = {}
  fromSpy.mockReset()
  fromSpy.mockImplementation((t: string) => makeChain(t))
  rateLimitSpy.mockClear()
  seedHands()
})

describe('rummy hands de-redact when the session says finished', () => {
  it('redacts while both the game and the session are live', async () => {
    tables['games'] = { data: { status: 'active' }, error: null }
    tables['rummy_sessions'] = { data: { phase: 'playing' }, error: null }

    const body = (await (await post(rummyHands, { gameCode: 'ABCD', resumeToken: MY_TOKEN })).json()) as {
      hands: { player_id: string; cards: unknown; card_count: number }[]
    }
    const them = body.hands.find((h) => h.player_id === 'them')!
    expect(them.cards).toBeNull()
    expect(them.card_count).toBe(2)
  })

  it('reveals every hand once rummy_sessions.phase is finished, even with games.status still active', async () => {
    // The window this fix exists for: session finished, games row not yet flipped.
    tables['games'] = { data: { status: 'active' }, error: null }
    tables['rummy_sessions'] = { data: { phase: 'finished' }, error: null }

    const body = (await (await post(rummyHands, { gameCode: 'ABCD', resumeToken: MY_TOKEN })).json()) as {
      hands: { player_id: string; cards: { id: string }[] | null }[]
    }
    const them = body.hands.find((h) => h.player_id === 'them')!
    expect(them.cards).toEqual([{ id: 'c2' }, { id: 'c3' }])
  })

  it('reveals every hand on games.status alone, with no session row at all', async () => {
    // The pre-existing path must keep working — alsoFinished is an OR, not a replacement.
    tables['games'] = { data: { status: 'finished' }, error: null }
    tables['rummy_sessions'] = { data: null, error: null }

    const body = (await (await post(rummyHands, { gameCode: 'ABCD' })).json()) as {
      hands: { player_id: string; cards: { id: string }[] | null }[]
    }
    expect(body.hands.every((h) => Array.isArray(h.cards))).toBe(true)
  })

  it('still redacts for a tokenless caller mid-game', async () => {
    tables['games'] = { data: { status: 'active' }, error: null }
    tables['rummy_sessions'] = { data: { phase: 'playing' }, error: null }

    const body = (await (await post(rummyHands, { gameCode: 'ABCD' })).json()) as {
      hands: { cards: unknown; card_count: number }[]
    }
    expect(body.hands.every((h) => h.cards === null)).toBe(true)
    expect(body.hands.map((h) => h.card_count)).toEqual([1, 2])
  })

  it('answers 400, not 500, for a non-string gameCode', async () => {
    // The factory used to do `body.gameCode?.toUpperCase()`, which throws on a number and was
    // answered as a 500 where the hand-written sibling routes answer 400.
    const res = await post(rummyHands, { gameCode: 123 })
    expect(res.status).toBe(400)
    expect((await res.json()) as unknown).toEqual({ error: 'gameCode is required' })
  })
})
