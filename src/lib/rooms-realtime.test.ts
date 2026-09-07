import { describe, it, expect } from 'vitest'
import {
  applyRoomsRealtimeEvent,
  roomIsBrowsable,
  watchedRoomsRealtimeFilters,
  PUBLIC_ROOMS_REALTIME_FILTER,
  WATCHED_ROOM_IDS_MAX,
  type BrowsableRoom,
} from './rooms-realtime'
import type { RoomRow } from './room-api'

function room(id: string, over: Partial<RoomRow> = {}): RoomRow {
  return {
    id,
    name: `Room ${id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    is_public: true,
    is_locked: false,
    description: null,
    timezone: null,
    max_members: null,
    ...over,
  } as RoomRow
}

function listed(id: string, over: Partial<RoomRow> = {}): BrowsableRoom {
  return { ...room(id, over), memberCount: 3 }
}

describe('PUBLIC_ROOMS_REALTIME_FILTER', () => {
  it('uses an operator Supabase realtime actually supports', () => {
    // Realtime filters only support eq/neq/gt/gte/lt/lte/in on a single column.
    expect(PUBLIC_ROOMS_REALTIME_FILTER).toBe('is_public=eq.true')
    expect(PUBLIC_ROOMS_REALTIME_FILTER).toMatch(/^[a-z_]+=(eq|neq|gt|gte|lt|lte|in)\./)
    // `is_public AND NOT is_locked` is NOT expressible — is_locked stays client-side.
    expect(PUBLIC_ROOMS_REALTIME_FILTER).not.toContain('is_locked')
  })
})

describe('watchedRoomsRealtimeFilters', () => {
  it('builds an id=in.(…) filter over the listed room codes', () => {
    expect(watchedRoomsRealtimeFilters(['ABC123', 'ZZZ999'])).toEqual(['id=in.(ABC123,ZZZ999)'])
  })

  it('returns no filters when there is nothing to watch', () => {
    expect(watchedRoomsRealtimeFilters([])).toEqual([])
  })

  it('drops ids outside the room-code alphabet so they cannot corrupt the expression', () => {
    // Room ids are generateGameCode() codes: uppercase A–Z / digits only. Anything else
    // (injection attempts included) is not a real room id and must never reach the filter.
    expect(watchedRoomsRealtimeFilters(['ABC123', 'evil),id=in.(X'])).toEqual(['id=in.(ABC123)'])
    expect(watchedRoomsRealtimeFilters(['(', '', 'abc123'])).toEqual([])
  })

  it("chunks past Supabase realtime's documented in-filter limit instead of dropping ids", () => {
    // A viewer who has paged past 100 rooms must still get the going-private frame for
    // room #101 — a single truncated filter would silently drop it.
    const ids = Array.from({ length: WATCHED_ROOM_IDS_MAX + 20 }, (_, i) => `R${i}`)
    const filters = watchedRoomsRealtimeFilters(ids)
    expect(filters).toHaveLength(2)
    expect(filters[0].match(/,/g)).toHaveLength(WATCHED_ROOM_IDS_MAX - 1)
    expect(filters[1]).toBe(`id=in.(${ids.slice(WATCHED_ROOM_IDS_MAX).join(',')})`)
    // Every id appears in exactly one chunk.
    for (const id of ids) {
      expect(filters.filter((f) => f.includes(`${id},`) || f.includes(`${id})`)).length).toBe(1)
    }
  })

  it('keeps every chunk within the 100-value cap', () => {
    const ids = Array.from({ length: WATCHED_ROOM_IDS_MAX * 3 + 1 }, (_, i) => `R${i}`)
    const filters = watchedRoomsRealtimeFilters(ids)
    expect(filters).toHaveLength(4)
    for (const filter of filters) {
      expect(filter.slice('id=in.('.length, -1).split(',').length).toBeLessThanOrEqual(WATCHED_ROOM_IDS_MAX)
    }
  })
})

describe('roomIsBrowsable', () => {
  it('requires public and unlocked', () => {
    expect(roomIsBrowsable({ is_public: true, is_locked: false })).toBe(true)
    expect(roomIsBrowsable({ is_public: true, is_locked: true })).toBe(false)
    expect(roomIsBrowsable({ is_public: false, is_locked: false })).toBe(false)
  })
})

describe('applyRoomsRealtimeEvent', () => {
  it('removes a deleted room by primary key alone', () => {
    // REPLICA IDENTITY DEFAULT: the DELETE payload carries only the id.
    const prev = [listed('a'), listed('b')]
    const { rooms, reload } = applyRoomsRealtimeEvent(prev, { eventType: 'DELETE', id: 'a' })
    expect(rooms.map((r) => r.id)).toEqual(['b'])
    expect(reload).toBe(false)
  })

  it('ignores a DELETE with no id rather than clearing the list', () => {
    const prev = [listed('a')]
    const { rooms, reload } = applyRoomsRealtimeEvent(prev, { eventType: 'DELETE', id: undefined })
    expect(rooms).toBe(prev)
    expect(reload).toBe(false)
  })

  it('reloads on the INSERT of a visible room so memberCount arrives', () => {
    const { rooms, reload } = applyRoomsRealtimeEvent([], { eventType: 'INSERT', room: room('a') })
    expect(rooms).toEqual([])
    expect(reload).toBe(true)
  })

  it('drops a room that gets locked, since the filter cannot express is_locked', () => {
    const prev = [listed('a'), listed('b')]
    const { rooms, reload } = applyRoomsRealtimeEvent(prev, {
      eventType: 'UPDATE',
      room: room('a', { is_locked: true }),
    })
    expect(rooms.map((r) => r.id)).toEqual(['b'])
    expect(reload).toBe(false)
  })

  it('patches a listed room in place without a refetch', () => {
    const prev = [listed('a'), listed('b')]
    const { rooms, reload } = applyRoomsRealtimeEvent(prev, {
      eventType: 'UPDATE',
      room: room('a', { name: 'Renamed' }),
    })
    expect(rooms.find((r) => r.id === 'a')?.name).toBe('Renamed')
    // memberCount is not in the realtime payload shape used by the list — keep it.
    expect(rooms.find((r) => r.id === 'a')?.memberCount).toBe(3)
    expect(reload).toBe(false)
  })

  it('reloads when a room becomes visible while off-list', () => {
    const { rooms, reload } = applyRoomsRealtimeEvent([listed('b')], {
      eventType: 'UPDATE',
      room: room('a'),
    })
    expect(rooms.map((r) => r.id)).toEqual(['b'])
    expect(reload).toBe(true)
  })
})
