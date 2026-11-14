import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Redaction contract of POST /api/gofish/hands — the only way a browser may learn Go Fish hands
 * once anon/authenticated lose SELECT on `gofish_player_hands.cards`
 * (20261130130000_sec_gofish_hide_hands_and_ocean.sql).
 *
 * The players stub HONOURS the `resume_token` filter, so a wrong token genuinely resolves to
 * nobody rather than to whatever row the stub happens to hold.
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
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}

function makeChain(table: string): any {
  const filters: Array<[string, unknown]> = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
  const chain: any = {
    select: () => chain,
    order: () => chain,
    eq: (k: string, v: unknown) => {
      filters.push([k, v])
      return chain
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: any, err: any) => Promise.resolve({ data: rows(), error: null }).then(ok, err),
  }
  return chain
}

import { POST as goFishHands } from '@/app/api/gofish/hands/route'

function post(body: unknown) {
  return goFishHands(
    new Request('http://localhost/api/gofish/hands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MY_TOKEN = 'AAAA1111BBBB2222'
const THEIR_TOKEN = 'CCCC3333DDDD4444'
const MY_CARDS = [{ id: 'c1', rank: 3, suit: 'H' }]
const THEIR_CARDS = [
  { id: 'c2', rank: 7, suit: 'S' },
  { id: 'c3', rank: 9, suit: 'D' },
]

beforeEach(() => {
  rateLimitSpy.mockClear()
  fromSpy.mockReset()
  fromSpy.mockImplementation((t: string) => makeChain(t))
  tables = {
    games: [{ id: 'ABCD', status: 'active' }],
    players: [
      { id: 'me', game_id: 'ABCD', resume_token: MY_TOKEN },
      { id: 'them', game_id: 'ABCD', resume_token: THEIR_TOKEN },
    ],
    gofish_player_hands: [
      { id: 'h1', game_id: 'ABCD', player_id: 'me', cards: MY_CARDS, books: [2], player_order: 0 },
      { id: 'h2', game_id: 'ABCD', player_id: 'them', cards: THEIR_CARDS, books: [], player_order: 1 },
    ],
    gofish_sessions: [{ game_id: 'ABCD', ocean: [{ id: 'secret-draw' }] }],
  }
})

describe('POST /api/gofish/hands', () => {
  it('returns the caller their own hand in full and opponents as a count only', async () => {
    const res = await post({ gameCode: 'abcd', resumeToken: MY_TOKEN })
    expect(res.status).toBe(200)
    const { hands } = await res.json()
    expect(hands).toHaveLength(2)
    expect(hands[0]).toMatchObject({ player_id: 'me', cards: MY_CARDS, card_count: 1, books: [2] })
    expect(hands[1]).toMatchObject({ player_id: 'them', cards: null, card_count: 2, books: [] })
  })

  it("never serialises another player's cards or the ocean", async () => {
    const res = await post({ gameCode: 'ABCD', resumeToken: MY_TOKEN })
    const text = JSON.stringify(await res.json())
    for (const c of THEIR_CARDS) expect(text).not.toContain(c.id)
    expect(text).not.toContain('secret-draw')
    expect(text).not.toContain('ocean')
  })

  it('treats a wrong resume token as a spectator: counts only, nobody has cards', async () => {
    const res = await post({ gameCode: 'ABCD', resumeToken: 'ZZZZ9999YYYY8888' })
    expect(res.status).toBe(200)
    const { hands } = await res.json()
    expect(hands.map((h: Row) => h.cards)).toEqual([null, null])
    expect(hands.map((h: Row) => h.card_count)).toEqual([1, 2])
  })

  it('does not accept a forged playerId in place of a secret', async () => {
    const { hands } = await (await post({ gameCode: 'ABCD', playerId: 'them' })).json()
    expect(hands.map((h: Row) => h.cards)).toEqual([null, null])
  })

  it('treats a missing token and a host token alone as counts only', async () => {
    for (const body of [{ gameCode: 'ABCD' }, { gameCode: 'ABCD', hostToken: 'host-secret' }]) {
      const { hands } = await (await post(body)).json()
      expect(hands.map((h: Row) => h.cards)).toEqual([null, null])
    }
  })

  it('reveals every hand once the game is finished', async () => {
    tables.games = [{ id: 'ABCD', status: 'finished' }]
    const { hands } = await (await post({ gameCode: 'ABCD' })).json()
    expect(hands.map((h: Row) => h.cards)).toEqual([MY_CARDS, THEIR_CARDS])
  })

  it('answers 400 without a usable game code', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ gameCode: 123 })).status).toBe(400)
  })

  it('applies the rate limit', async () => {
    await post({ gameCode: 'ABCD', resumeToken: MY_TOKEN })
    expect(rateLimitSpy).toHaveBeenCalledTimes(1)
  })
})
