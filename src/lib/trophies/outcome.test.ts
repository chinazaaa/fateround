import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { gameTypesWithWinners, hasWinnerSource, isWinnerlessByDesign, resolveWinners } from './outcome'

/** Minimal stand-in for the one query shape `resolveWinners` issues. */
function client(result: { data?: unknown; error?: unknown }): SupabaseClient {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
      }),
    }),
  }))
  return { from } as unknown as SupabaseClient
}

describe('resolveWinners', () => {
  it('reads a single winner from the game’s own session table', async () => {
    const supabase = client({ data: { winner_player_id: 'p-1' } })
    expect(await resolveWinners(supabase, 'ABCD', 'whot')).toEqual(['p-1'])
  })

  it('mahjong: the match winner is the top of the cumulative scores, not the last hand', async () => {
    // winner_player_id would be whoever won the final HAND; the match belongs to the highest
    // total. Ties at the top return every leader.
    const supabase = client({ data: { scores: { 'p-1': 42000, 'p-2': 30000, 'p-3': 18000 } } })
    expect(await resolveWinners(supabase, 'ABCD', 'mahjong')).toEqual(['p-1'])
    const tied = client({ data: { scores: { 'p-1': 30000, 'p-2': 30000, 'p-3': 10000 } } })
    expect(await resolveWinners(tied, 'ABCD', 'mahjong')).toEqual(['p-1', 'p-2'])
  })

  it('mahjong: everyone level is a draw, not everyone winning', async () => {
    const supabase = client({ data: { scores: { 'p-1': 25000, 'p-2': 25000 } } })
    expect(await resolveWinners(supabase, 'ABCD', 'mahjong')).toEqual([])
  })

  it('returns [] for a finished game with genuinely no winner', async () => {
    // A draw or an abandoned game. Distinct from "we cannot tell" — see below.
    const supabase = client({ data: { winner_player_id: null } })
    expect(await resolveWinners(supabase, 'ABCD', 'chess')).toEqual([])
  })

  it('returns null — not [] — for a game with no winner concept, without querying', async () => {
    // The distinction is load-bearing. Collapsing null into [] would record "did not win" for
    // every poll game, making a "never lost" trophy earnable by playing the ones that have no
    // winner at all. It should also cost nothing: no table is worth checking here.
    const supabase = client({ data: { winner_player_id: 'p-1' } })
    expect(await resolveWinners(supabase, 'ABCD', 'never_have_i_ever')).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns null when the row is missing', async () => {
    expect(await resolveWinners(client({ data: null }), 'ABCD', 'whot')).toBeNull()
  })

  it('returns null when the query errors rather than claiming nobody won', async () => {
    expect(await resolveWinners(client({ error: { code: '42P01' } }), 'ABCD', 'whot')).toBeNull()
  })

  it('never throws, whatever the client does', async () => {
    const exploding = {
      from: () => {
        throw new Error('connection reset')
      },
    } as unknown as SupabaseClient
    // An award pass must not fail a request because one game's outcome was unreadable.
    await expect(resolveWinners(exploding, 'ABCD', 'whot')).resolves.toBeNull()
  })

  it('ignores non-string junk in a winner column', async () => {
    // Codewords-style array standings still need the junk filter; use the standings fallback via
    // a scalar-less game. Here we assert the scalar path stays string-only.
    const supabase = client({ data: { winner_player_id: 42 } })
    expect(await resolveWinners(supabase, 'ABCD', 'whot')).toEqual([])
  })
})

describe('the winner-source map', () => {
  it('covers the seat-based games and reports which they are', () => {
    const covered = gameTypesWithWinners()
    for (const gameType of ['whot', 'chess', 'monopoly', 'uno', 'ludo', 'mahjong'] as GameType[]) {
      expect(covered, `${gameType} should have a server-readable winner`).toContain(gameType)
    }
  })

  it('covers the competitive non-seat games through derived standings', () => {
    // These keep no winner column, but room points already derives their finishing order —
    // reused rather than reimplemented, so the two notions of "who won" can't drift.
    for (const gameType of ['trivia', 'bingo', 'codewords', 'sudoku'] as GameType[]) {
      expect(hasWinnerSource(gameType), `${gameType} should resolve via standings`).toBe(true)
    }
  })

  it('separates "no winner by design" from "not measured yet"', () => {
    // Different messages for the admin UI: one is the product working as intended, the other
    // is a limitation someone might go and fix. Conflating them makes the warning meaningless.
    expect(isWinnerlessByDesign('never_have_i_ever' as GameType)).toBe(true)
    expect(isWinnerlessByDesign('would_you_rather' as GameType)).toBe(true)
    expect(hasWinnerSource('never_have_i_ever' as GameType)).toBe(false)

    // A competitive game is never "winnerless by design", whichever route resolves it.
    for (const gameType of ['chess', 'trivia', 'whot'] as GameType[]) {
      expect(isWinnerlessByDesign(gameType), `${gameType} does have winners`).toBe(false)
    }
  })

  it('maps both 10×10 draughts variants, which share one engine and one table', () => {
    expect(hasWinnerSource('checkers_international' as GameType)).toBe(true)
    expect(hasWinnerSource('checkers_nigeria' as GameType)).toBe(true)
    expect(hasWinnerSource('checkers' as GameType)).toBe(true)
  })
})

describe('custom winner resolvers', () => {
  // A client that returns different rows per table (the custom resolvers query several).
  function multi(byTable: Record<string, unknown>): SupabaseClient {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: byTable[table] ?? [], error: null }),
            maybeSingle: async () => ({ data: byTable[table] ?? null, error: null }),
            then: (r: (v: { data: unknown; error: null }) => unknown) => r({ data: byTable[table] ?? [], error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
  }

  it('mafia: a team win credits every player whose role maps to the winning team', async () => {
    const db = multi({
      mafia_sessions: { winning_team: 'mafia' },
      mafia_player_states: [
        { player_id: 'm1', role: 'mafia', is_lover: false },
        { player_id: 'm2', role: 'framer', is_lover: false }, // framer is on the mafia team
        { player_id: 'v1', role: 'doctor', is_lover: false },
        { player_id: 'v2', role: 'villager', is_lover: false },
      ],
    })
    expect(await resolveWinners(db, 'G', 'mafia')).toEqual(['m1', 'm2'])
  })

  it('mafia: a lovers win credits the two linked players whatever their roles', async () => {
    const db = multi({
      mafia_sessions: { winning_team: 'lovers' },
      mafia_player_states: [
        { player_id: 'a', role: 'mafia', is_lover: true },
        { player_id: 'b', role: 'villager', is_lover: true },
        { player_id: 'c', role: 'doctor', is_lover: false },
      ],
    })
    expect(await resolveWinners(db, 'G', 'mafia')).toEqual(['a', 'b'])
  })

  it('describe_it (team mode): every player on the winning team wins', async () => {
    const db = multi({
      games: { describe_it_num_teams: 2, describe_it_mode: 'team' },
      describe_it_players: [
        { player_id: 'a', team: 1, score: 0 },
        { player_id: 'b', team: 1, score: 0 },
        { player_id: 'c', team: 2, score: 0 },
      ],
      describe_it_words: [
        { team: 1, status: 'guessed' },
        { team: 1, status: 'guessed' },
        { team: 2, status: 'guessed' },
      ],
    })
    expect(await resolveWinners(db, 'G', 'describe_it')).toEqual(['a', 'b'])
  })

  it('describe_it (individual mode): the top scorer wins', async () => {
    const db = multi({
      games: { describe_it_num_teams: 1, describe_it_mode: 'individual' },
      describe_it_players: [
        { player_id: 'a', team: 0, score: 12 },
        { player_id: 'b', team: 0, score: 5 },
      ],
    })
    expect(await resolveWinners(db, 'G', 'describe_it')).toEqual(['a'])
  })
})
