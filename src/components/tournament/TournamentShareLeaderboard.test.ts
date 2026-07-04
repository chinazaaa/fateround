import { describe, it, expect } from 'vitest'
import type { TournamentPlayer, TournamentGame } from '@/types/tournament'
import { buildLastRoundRank, orderForStandings } from './TournamentShareLeaderboard'

function player(overrides: Partial<TournamentPlayer> & { id: string }): TournamentPlayer {
  return {
    tournament_id: 'T',
    player_name: overrides.id,
    total_points: 0,
    games_played: 0,
    joined_at: '2026-01-01T00:00:00.000Z',
    lives_remaining: null,
    is_eliminated: false,
    eliminated_at: null,
    ...overrides,
  }
}

function game(overrides: Partial<TournamentGame> & { id: string }): TournamentGame {
  return {
    tournament_id: 'T',
    game_id: overrides.id,
    game_order: 0,
    status: 'finished',
    placements: null,
    round_number: null,
    match_index: null,
    player_a_id: null,
    ...(overrides as object),
  } as TournamentGame
}

describe('buildLastRoundRank', () => {
  it('maps each player to their placement in the latest finished round they played', () => {
    const games = [
      game({ id: 'r1', round_number: 1, placements: { a: 1, b: 2, c: 3, d: 4 } }),
      // c and d were cut in round 1, so they only appear in r1; a and b play r2.
      game({ id: 'r2', round_number: 2, placements: { a: 2, b: 1 } }),
    ]
    const rank = buildLastRoundRank(games)
    expect(rank.get('a')).toBe(2) // overwritten by round 2
    expect(rank.get('b')).toBe(1) // overwritten by round 2
    expect(rank.get('c')).toBe(3) // only ever in round 1
    expect(rank.get('d')).toBe(4)
  })

  it('ignores unfinished games and rows without placements/round_number', () => {
    const games = [
      game({ id: 'active', round_number: 1, status: 'active', placements: { a: 1 } }),
      game({ id: 'bye', round_number: 1, placements: null }),
      game({ id: 'done', round_number: 1, placements: { b: 1 } }),
    ]
    const rank = buildLastRoundRank(games)
    expect(rank.has('a')).toBe(false)
    expect(rank.get('b')).toBe(1)
  })
})

describe('orderForStandings (knockout)', () => {
  it('orders survivors by last-round placement, not join order', () => {
    // Join order is a, b, c (as the API returns them for a 0-points knockout field).
    const players = [
      player({ id: 'a', joined_at: '2026-01-01T00:00:00Z' }),
      player({ id: 'b', joined_at: '2026-01-01T00:01:00Z' }),
      player({ id: 'c', joined_at: '2026-01-01T00:02:00Z' }),
    ]
    // Last round: c placed 1st, a 2nd, b 3rd.
    const rank = new Map([
      ['a', 2],
      ['b', 3],
      ['c', 1],
    ])
    const ranked = orderForStandings(players, true, rank).map((p) => p.id)
    expect(ranked).toEqual(['c', 'a', 'b'])
  })

  it('keeps survivors above eliminated players, most-recently-eliminated first', () => {
    const players = [
      player({ id: 'earlyOut', is_eliminated: true, eliminated_at: '2026-01-01T00:00:00Z' }),
      player({ id: 'survivor' }),
      player({ id: 'lateOut', is_eliminated: true, eliminated_at: '2026-01-01T01:00:00Z' }),
    ]
    const ranked = orderForStandings(players, true).map((p) => p.id)
    expect(ranked).toEqual(['survivor', 'lateOut', 'earlyOut'])
  })

  it('breaks ties among players cut in the same round by their round placement', () => {
    const cutAt = '2026-01-01T00:00:00Z'
    const players = [
      player({ id: 'x', is_eliminated: true, eliminated_at: cutAt }),
      player({ id: 'y', is_eliminated: true, eliminated_at: cutAt }),
    ]
    // y placed higher (3) than x (4) in the round they were both cut.
    const rank = new Map([
      ['x', 4],
      ['y', 3],
    ])
    const ranked = orderForStandings(players, true, rank).map((p) => p.id)
    expect(ranked).toEqual(['y', 'x'])
  })
})
