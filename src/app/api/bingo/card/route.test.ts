import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Authorization contract for /api/bingo/card.
 *
 * `bingo_cards.cells` / `.marked_indices` are the secret of the game — knowing another player's
 * card is knowing exactly when they are about to win. The route is the ONLY reader once anon
 * loses SELECT on those columns, so its answer to "who may read whose card" is the whole control.
 *
 * The contract is deliberately narrow: a resume token returns THAT player's card and nothing
 * else. In particular there is no host path — an earlier revision let `hostToken` + an arbitrary
 * `playerId` read any player's card, which handed every holder of the shared /host/CODE link the
 * whole table mid-game. These tests pin that shut.
 */

const ROWS = {
  game: { game_type: 'bingo' },
  players: [
    { id: 'p-alice', resume_token: 'AAAA1111BBBB2222CCCC3333' },
    { id: 'p-bob', resume_token: 'DDDD4444EEEE5555FFFF6666' },
  ],
  cards: [
    { id: 'c-alice', player_id: 'p-alice', cells: [1, 2, 3], marked_indices: [0] },
    { id: 'c-bob', player_id: 'p-bob', cells: [4, 5, 6], marked_indices: [] },
  ],
}

/** Minimal PostgREST-shaped stub: `.from(t).select(...).eq(c, v)...maybeSingle()`. */
function makeSupabase(game: { game_type: string } | null = ROWS.game, dealt = true) {
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {}
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value
        return chain
      },
      maybeSingle: async () => {
        if (table === 'games') return { data: game, error: null }
        if (table === 'players') {
          const row = ROWS.players.find((p) => p.resume_token === filters.resume_token)
          return { data: row ? { id: row.id } : null, error: null }
        }
        if (table === 'bingo_cards') {
          const row = dealt ? ROWS.cards.find((c) => c.player_id === filters.player_id) : undefined
          return { data: row ?? null, error: null }
        }
        return { data: null, error: null }
      },
    }
    return chain
  }
  return { from: builder }
}

const getSupabaseAdmin = vi.fn(() => makeSupabase())

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: async () => null,
  RATE_LIMITS: { handsFetch: { limit: 60, windowMs: 60_000 } },
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/bingo/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )
}

beforeEach(() => {
  getSupabaseAdmin.mockImplementation(() => makeSupabase())
})

describe('POST /api/bingo/card', () => {
  it("returns the caller's own card for a valid resume token", async () => {
    const res = await post({ gameCode: 'ABC123', resumeToken: 'AAAA1111BBBB2222CCCC3333' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      card: { id: 'c-alice', player_id: 'p-alice', cells: [1, 2, 3], marked_indices: [0] },
    })
  })

  it("never returns another player's card, however the caller asks for it", async () => {
    // A forged playerId alongside a real token: the token wins, every time.
    const res = await post({ gameCode: 'ABC123', resumeToken: 'AAAA1111BBBB2222CCCC3333', playerId: 'p-bob' })
    const body = await res.json()
    expect(body.card.player_id).toBe('p-alice')
  })

  it('gives a host token NOTHING — running the board never requires seeing a card', async () => {
    // The regression this route existed to create: hostToken + any playerId returned that
    // player's card to anyone holding the shared /host/CODE link.
    const res = await post({ gameCode: 'ABC123', hostToken: 'host-token', playerId: 'p-bob' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('401s an unknown or missing resume token rather than answering with an empty card', async () => {
    // "Not allowed" must never arrive looking like "no card dealt yet" — a null card is real
    // game state and the clients leave the board waiting on it.
    for (const body of [{ gameCode: 'ABC123' }, { gameCode: 'ABC123', resumeToken: '9999999999999999' }]) {
      const res = await post(body)
      expect(res.status).toBe(401)
      expect((await res.json()).card).toBeUndefined()
    }
  })

  it('reports a genuinely undealt card as null with a 200 — the "still dealing" state', async () => {
    getSupabaseAdmin.mockImplementation(() => makeSupabase(ROWS.game, false))
    const res = await post({ gameCode: 'ABC123', resumeToken: 'AAAA1111BBBB2222CCCC3333' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ card: null })
  })

  it('rejects a non-bingo game and a missing code before touching any card', async () => {
    expect((await post({})).status).toBe(400)
    getSupabaseAdmin.mockImplementation(() => makeSupabase({ game_type: 'whot' }))
    expect((await post({ gameCode: 'ABC123', resumeToken: 'AAAA1111BBBB2222CCCC3333' })).status).toBe(400)
    getSupabaseAdmin.mockImplementation(() => makeSupabase(null))
    expect((await post({ gameCode: 'ABC123', resumeToken: 'AAAA1111BBBB2222CCCC3333' })).status).toBe(404)
  })
})
