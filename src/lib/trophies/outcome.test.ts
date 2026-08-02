import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { gameTypesWithWinners, hasWinnerSource, resolveWinners } from './outcome'

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

  it('prefers the array column when a game can have several winners', async () => {
    const supabase = client({ data: { winner_player_id: 'p-1', winner_player_ids: ['p-1', 'p-2'] } })
    expect(await resolveWinners(supabase, 'ABCD', 'mahjong')).toEqual(['p-1', 'p-2'])
  })

  it('falls back to the scalar when the array is empty', async () => {
    const supabase = client({ data: { winner_player_id: 'p-9', winner_player_ids: [] } })
    expect(await resolveWinners(supabase, 'ABCD', 'mahjong')).toEqual(['p-9'])
  })

  it('returns [] for a finished game with genuinely no winner', async () => {
    // A draw or an abandoned game. Distinct from "we cannot tell" — see below.
    const supabase = client({ data: { winner_player_id: null } })
    expect(await resolveWinners(supabase, 'ABCD', 'chess')).toEqual([])
  })

  it('returns null — not [] — for a game type it cannot measure', async () => {
    // The distinction is load-bearing. Collapsing null into [] would record "did not win" for
    // every trivia game, making a "never lost" trophy earnable by playing the unmeasurable ones.
    const supabase = client({ data: { winner_player_id: 'p-1' } })
    expect(await resolveWinners(supabase, 'ABCD', 'trivia')).toBeNull()
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

  it('ignores non-string junk in the array column', async () => {
    const supabase = client({ data: { winner_player_id: null, winner_player_ids: [null, 42, 'p-3', ''] } })
    expect(await resolveWinners(supabase, 'ABCD', 'mahjong')).toEqual(['p-3'])
  })
})

describe('the winner-source map', () => {
  it('covers the seat-based games and reports which they are', () => {
    const covered = gameTypesWithWinners()
    for (const gameType of ['whot', 'chess', 'monopoly', 'uno', 'ludo', 'mahjong'] as GameType[]) {
      expect(covered, `${gameType} should have a server-readable winner`).toContain(gameType)
    }
  })

  it('reports poll and quiz games as unmeasurable, so the admin UI can warn', () => {
    // Not a gap to paper over: a "win 10 games" rule for these parses, saves, and silently
    // never fires — indistinguishable from a typo unless the UI says so up front.
    for (const gameType of ['trivia', 'never_have_i_ever', 'bingo'] as GameType[]) {
      expect(hasWinnerSource(gameType)).toBe(false)
    }
  })

  it('maps both 10×10 draughts variants, which share one engine and one table', () => {
    expect(hasWinnerSource('checkers_international' as GameType)).toBe(true)
    expect(hasWinnerSource('checkers_nigeria' as GameType)).toBe(true)
    expect(hasWinnerSource('checkers' as GameType)).toBe(true)
  })
})
