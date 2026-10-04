import { describe, it, expect } from 'vitest'
import {
  applyBrowseGamesRealtimeEvent,
  gameIsBrowsable,
  pickBrowseFields,
  PUBLIC_GAMES_REALTIME_FILTER,
  WATCHED_GAME_IDS_MAX,
  watchedGamesRealtimeFilters,
  type GamesRealtimeRow,
} from './browse-games-realtime'
import type { PublicGame } from './game-browse'

function row(over: Partial<GamesRealtimeRow> = {}): GamesRealtimeRow {
  return {
    id: 'ABC123',
    title: 'Game night',
    game_type: 'trivia',
    status: 'waiting',
    max_players: 8,
    allow_late_players: true,
    created_at: '2026-08-31T10:00:00.000Z',
    scheduled_at: null,
    is_public: true,
    ...over,
  }
}

function listed(over: Partial<PublicGame> = {}): PublicGame {
  return { ...pickBrowseFields(row()), playerCount: 3, viewerCount: 1, ...over }
}

describe('PUBLIC_GAMES_REALTIME_FILTER', () => {
  it('is a single-column equality filter realtime can actually express', () => {
    expect(PUBLIC_GAMES_REALTIME_FILTER).toBe('is_public=eq.true')
  })
})

describe('watchedGamesRealtimeFilters', () => {
  it('builds an id=in.(…) filter over the listed ids', () => {
    expect(watchedGamesRealtimeFilters(['ABC123', 'ZZZ999'])).toEqual(['id=in.(ABC123,ZZZ999)'])
  })

  it('returns no filters when there is nothing to watch', () => {
    expect(watchedGamesRealtimeFilters([])).toEqual([])
  })

  it('drops ids outside the game-code alphabet so they cannot corrupt the expression', () => {
    expect(watchedGamesRealtimeFilters(['ABC123', 'evil),id=in.(X'])).toEqual(['id=in.(ABC123)'])
    expect(watchedGamesRealtimeFilters(['(', ''])).toEqual([])
  })

  it("chunks past Supabase realtime's documented in-filter limit instead of dropping ids", () => {
    // A viewer who has paged past 100 games must still get the going-private frame for
    // game #101 — the old single-filter version silently truncated it.
    const ids = Array.from({ length: WATCHED_GAME_IDS_MAX + 20 }, (_, i) => `G${i}`)
    const filters = watchedGamesRealtimeFilters(ids)
    expect(filters).toHaveLength(2)
    expect(filters[0].match(/,/g)).toHaveLength(WATCHED_GAME_IDS_MAX - 1)
    expect(filters[1]).toBe(`id=in.(${ids.slice(WATCHED_GAME_IDS_MAX).join(',')})`)
    // Every id appears in exactly one chunk.
    for (const id of ids) {
      expect(filters.filter((f) => f.includes(`${id},`) || f.includes(`${id})`)).length).toBeGreaterThan(0)
    }
  })

  it('keeps every chunk within the 100-value cap', () => {
    const ids = Array.from({ length: WATCHED_GAME_IDS_MAX * 3 + 1 }, (_, i) => `G${i}`)
    const filters = watchedGamesRealtimeFilters(ids)
    expect(filters).toHaveLength(4)
    for (const filter of filters) {
      const values = filter.slice('id=in.('.length, -1).split(',')
      expect(values.length).toBeLessThanOrEqual(WATCHED_GAME_IDS_MAX)
    }
  })
})

describe('gameIsBrowsable', () => {
  it('requires is_public', () => {
    expect(gameIsBrowsable(row({ is_public: false }), 'live')).toBe(false)
    expect(gameIsBrowsable(row({ is_public: null }), 'live')).toBe(false)
  })

  it('mirrors the API .gte(max_players, 2), including the NULL exclusion', () => {
    expect(gameIsBrowsable(row({ max_players: 2 }), 'live')).toBe(true)
    expect(gameIsBrowsable(row({ max_players: 1 }), 'live')).toBe(false)
    // SQL `NULL >= 2` is unknown, so .gte() drops these rows — the client must agree.
    expect(gameIsBrowsable(row({ max_players: null }), 'live')).toBe(false)
  })

  it('splits statuses by tab the way GET /api/games does', () => {
    expect(gameIsBrowsable(row({ status: 'waiting' }), 'live')).toBe(true)
    expect(gameIsBrowsable(row({ status: 'active' }), 'live')).toBe(true)
    expect(gameIsBrowsable(row({ status: 'finished' }), 'live')).toBe(false)
    expect(gameIsBrowsable(row({ status: 'scheduled' }), 'live')).toBe(false)

    expect(gameIsBrowsable(row({ status: 'scheduled' }), 'upcoming')).toBe(true)
    expect(gameIsBrowsable(row({ status: 'waiting' }), 'upcoming')).toBe(false)
  })
})

describe('pickBrowseFields', () => {
  it('copies only the browse columns, never the rest of the payload row', () => {
    const payload = { ...row(), host_user_id: 'u1', trivia_questions: [1, 2, 3] } as GamesRealtimeRow
    expect(Object.keys(pickBrowseFields(payload)).sort()).toEqual(
      ['allow_late_players', 'created_at', 'game_type', 'id', 'max_players', 'scheduled_at', 'status', 'title'].sort()
    )
  })
})

describe('applyBrowseGamesRealtimeEvent', () => {
  it('applies an UPDATE to a listed game in place with NO refetch', () => {
    const prev = [listed()]
    const result = applyBrowseGamesRealtimeEvent(prev, { eventType: 'UPDATE', row: row({ status: 'active' }) }, 'live')
    expect(result.reload).toBe(false)
    expect(result.games[0]?.status).toBe('active')
  })

  it('preserves attendance counts across an in-place update', () => {
    const prev = [listed({ playerCount: 5, viewerCount: 2 })]
    const result = applyBrowseGamesRealtimeEvent(prev, { eventType: 'UPDATE', row: row({ title: 'Renamed' }) }, 'live')
    expect(result.games[0]?.playerCount).toBe(5)
    expect(result.games[0]?.viewerCount).toBe(2)
    expect(result.games[0]?.title).toBe('Renamed')
  })

  it('does not smuggle non-browse payload columns into list state', () => {
    const prev = [listed()]
    const payload = { ...row({ status: 'active' }), host_token: 'secret' } as GamesRealtimeRow
    const result = applyBrowseGamesRealtimeEvent(prev, { eventType: 'UPDATE', row: payload }, 'live')
    expect(result.games[0]).not.toHaveProperty('host_token')
    expect(result.games[0]).not.toHaveProperty('is_public')
  })

  it('removes a game that stops qualifying, without a refetch', () => {
    const prev = [listed()]
    for (const gone of [row({ status: 'finished' }), row({ is_public: false }), row({ max_players: 1 })]) {
      const result = applyBrowseGamesRealtimeEvent(prev, { eventType: 'UPDATE', row: gone }, 'live')
      expect(result.games).toHaveLength(0)
      expect(result.reload).toBe(false)
    }
  })

  it('refetches only when a game becomes visible while off-list', () => {
    const result = applyBrowseGamesRealtimeEvent([], { eventType: 'UPDATE', row: row() }, 'live')
    expect(result.reload).toBe(true)
    expect(result.games).toEqual([])
  })

  it('refetches on INSERT of a browsable game (payload has no playerCount)', () => {
    expect(applyBrowseGamesRealtimeEvent([], { eventType: 'INSERT', row: row() }, 'live').reload).toBe(true)
  })

  it('ignores an INSERT that could never be displayed', () => {
    const result = applyBrowseGamesRealtimeEvent([], { eventType: 'INSERT', row: row({ is_public: false }) }, 'live')
    expect(result.reload).toBe(false)
    expect(result.games).toEqual([])
  })

  it('drops a DELETE by primary key alone (REPLICA IDENTITY DEFAULT payload)', () => {
    const prev = [listed(), listed({ id: 'ZZZ999' })]
    const result = applyBrowseGamesRealtimeEvent(prev, { eventType: 'DELETE', id: 'ABC123' }, 'live')
    expect(result.games.map((g) => g.id)).toEqual(['ZZZ999'])
    expect(result.reload).toBe(false)
  })

  it('is a no-op for a DELETE payload with no id', () => {
    const prev = [listed()]
    expect(applyBrowseGamesRealtimeEvent(prev, { eventType: 'DELETE', id: undefined }, 'live').games).toBe(prev)
  })
})
