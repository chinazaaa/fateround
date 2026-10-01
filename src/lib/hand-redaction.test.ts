import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redactHands, resolveHandViewer } from '@/lib/hand-redaction'

const rows = [
  { id: 'h1', game_id: 'ABC123', player_id: 'me', cards: ['w1', 'w2', 'w3'], player_order: 0 },
  { id: 'h2', game_id: 'ABC123', player_id: 'them', cards: ['x1', 'x2'], player_order: 1 },
  { id: 'h3', game_id: 'ABC123', player_id: 'out', cards: [], player_order: 2 },
]

describe('redactHands', () => {
  it("returns the viewer's own cards in full", () => {
    const mine = redactHands(rows, 'me').find((h) => h.player_id === 'me')
    expect(mine?.cards).toEqual(['w1', 'w2', 'w3'])
    expect(mine?.card_count).toBe(3)
  })

  it("never returns another player's cards", () => {
    for (const row of redactHands(rows, 'me').filter((h) => h.player_id !== 'me')) {
      expect(row.cards).toBeNull()
    }
  })

  it('still reports every count, so the table UI and out-checks keep working', () => {
    expect(redactHands(rows, 'me').map((h) => h.card_count)).toEqual([3, 2, 0])
  })

  it('redacts everything for a spectator (null viewer)', () => {
    const out = redactHands(rows, null)
    expect(out.every((h) => h.cards === null)).toBe(true)
    expect(out.map((h) => h.card_count)).toEqual([3, 2, 0])
  })

  it('distinguishes "redacted" from "genuinely empty" — the bug that would mark a player out', () => {
    const viewed = redactHands(rows, 'out')
    const genuinelyEmpty = viewed.find((h) => h.player_id === 'out')
    const merelyHidden = viewed.find((h) => h.player_id === 'me')
    // An empty own hand is [] (really out); somebody else's is null (unknown), never [].
    expect(genuinelyEmpty?.cards).toEqual([])
    expect(genuinelyEmpty?.card_count).toBe(0)
    expect(merelyHidden?.cards).toBeNull()
    expect(merelyHidden?.card_count).toBe(3)
  })

  it('treats a malformed cards value as empty rather than throwing', () => {
    const bad = [{ id: 'h4', game_id: 'A', player_id: 'me', cards: null, player_order: 0 }]
    expect(redactHands(bad, 'me')[0].card_count).toBe(0)
  })
})

/**
 * `resolveHandViewer` decides WHO the caller is. `redactHands` above only decides what a
 * already-known viewer may see — it takes the viewer id as an input, so it can never catch a
 * mistake in this function. Nothing tested this until now; inverting its check would leave the
 * suite green while handing every caller someone else's hand.
 */

// Stand-in for `supabase.from('players').select('id').eq('game_id', …).eq('resume_token', …).maybeSingle()`.
const PLAYERS = [
  { id: 'p-alice', game_id: 'ABC123', resume_token: 'AAAA1111BBBB2222CCCC3333' },
  { id: 'p-bob', game_id: 'ABC123', resume_token: 'DDDD4444EEEE5555FFFF6666' },
  { id: 'p-carol', game_id: 'ZZZ999', resume_token: 'GGGG7777HHHH8888IIII9999' },
]

function mockSupabase(): { client: SupabaseClient; queries: number } {
  const state = { queries: 0 }
  const client = {
    from: () => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => {
          state.queries += 1
          const row = PLAYERS.find((pl) => pl.game_id === filters.game_id && pl.resume_token === filters.resume_token)
          return { data: row ? { id: row.id } : null, error: null }
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return {
    client,
    get queries() {
      return state.queries
    },
  } as { client: SupabaseClient; queries: number }
}

describe('resolveHandViewer', () => {
  it('resolves a valid resume token to that player', async () => {
    const { client } = mockSupabase()
    await expect(resolveHandViewer(client, 'ABC123', { resumeToken: 'AAAA1111BBBB2222CCCC3333' })).resolves.toBe(
      'p-alice'
    )
  })

  it('normalizes case, spaces and dashes before matching', async () => {
    const { client } = mockSupabase()
    await expect(resolveHandViewer(client, 'ABC123', { resumeToken: ' aaaa-1111 bbbb-2222 cccc-3333 ' })).resolves.toBe(
      'p-alice'
    )
  })

  it('returns null for an unknown token rather than guessing a viewer', async () => {
    const { client } = mockSupabase()
    await expect(resolveHandViewer(client, 'ABC123', { resumeToken: 'NOPE0000NOPE0000NOPE0000' })).resolves.toBeNull()
  })

  // The IDOR case: a token that is perfectly valid in another game must not resolve here.
  it('does not resolve a token belonging to a DIFFERENT game', async () => {
    const { client } = mockSupabase()
    await expect(resolveHandViewer(client, 'ABC123', { resumeToken: 'GGGG7777HHHH8888IIII9999' })).resolves.toBeNull()
  })

  // Deliberate design, not an oversight: running the board never requires seeing anyone's cards.
  //
  // The token here is deliberately a REAL player's resume token. With an arbitrary string like
  // 'host-secret' the assertion is nearly vacuous: a bug that wrongly fed hostToken into the
  // player lookup would still resolve nothing, because no player holds that value. Using a token
  // that WOULD match makes the test fail if the host path ever leaks into the resume-token
  // lookup, and `queries === 0` pins that the lookup is not attempted at all.
  it('gives a host token NOTHING, even one that matches a player resume token', async () => {
    const m = mockSupabase()
    await expect(resolveHandViewer(m.client, 'ABC123', { hostToken: PLAYERS[0].resume_token })).resolves.toBeNull()
    expect(m.queries).toBe(0)
  })

  it('gives a host token nothing even alongside an unknown resume token', async () => {
    const { client } = mockSupabase()
    await expect(
      resolveHandViewer(client, 'ABC123', { hostToken: 'host-secret', resumeToken: 'NOPE0000NOPE0000NOPE0000' })
    ).resolves.toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['too short after normalization', '-a-b-'],
  ])('returns null for a %s token without querying at all', async (_label, token) => {
    const m = mockSupabase()
    await expect(resolveHandViewer(m.client, 'ABC123', { resumeToken: token })).resolves.toBeNull()
    expect(m.queries).toBe(0)
  })
})
