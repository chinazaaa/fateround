import type { RoomRow } from '@/lib/room-api'

/**
 * Server-side filter for the browse-rooms realtime channel.
 *
 * The browse list only ever shows rooms where `is_public && !is_locked`, but the
 * subscription used to be unfiltered, so every visitor on the browse tab received an
 * event for every room INSERT/UPDATE/DELETE across the whole platform. `is_public`
 * defaults to false, so the overwhelming majority of those events were for rooms the
 * client could never display.
 *
 * Supabase realtime filters only support `eq/neq/gt/gte/lt/lte/in` on a single column,
 * so `is_public AND NOT is_locked` is not expressible — we filter on `is_public` and
 * keep the `is_locked` check client-side (see `roomIsBrowsable`). Locked public rooms
 * are a small slice, and a lock event still has to arrive so the room can be dropped
 * from the list.
 */
export const PUBLIC_ROOMS_REALTIME_FILTER = 'is_public=eq.true'

/**
 * DELETE is deliberately subscribed WITHOUT the filter.
 *
 * `rooms` uses REPLICA IDENTITY DEFAULT (no migration sets it to FULL), so the WAL
 * record for a DELETE carries only the primary key. A filter on `is_public` therefore
 * cannot match a DELETE payload and the event would silently never be delivered —
 * deleted rooms would linger in every browser's list until a manual reload. Keeping
 * DELETE unfiltered costs one tiny id-only event per room deletion, which is rare
 * compared to the INSERT/UPDATE firehose this filter removes.
 */
export const ROOMS_DELETE_IS_UNFILTERABLE = true

/**
 * Supabase realtime `in` filters have a documented cap of 100 values; watched ids are
 * chunked into multiple filters of at most this many ids each so every on-screen room gets
 * its leave-the-list frame, no matter how far the viewer has paged.
 */
export const WATCHED_ROOM_IDS_MAX = 100

/**
 * UPDATE filters for the rooms currently rendered on the browse tab.
 *
 * `PUBLIC_ROOMS_REALTIME_FILTER` is matched against the POST-update row, so the UPDATE
 * that takes a listed room private can never be delivered by the filtered channel — the
 * moment the event exists, the row no longer matches `is_public=eq.true`. Without this,
 * a room flipping public→private stayed visible to everyone already on the browse tab
 * until the next refetch. This second subscription pins the ids actually on screen, so
 * their UPDATEs always arrive and `applyRoomsRealtimeEvent` drops rows that stop
 * qualifying.
 *
 * Egress stays negligible: it only matches rows already rendered, and for rooms that stay
 * public it merely duplicates frames the filtered channel delivers (the reducer is
 * idempotent). The incremental cost is just the rare going-private frame.
 *
 * Returns one `id=in.(…)` filter per chunk of `WATCHED_ROOM_IDS_MAX` ids (the documented
 * per-filter cap) — the caller binds one postgres_changes handler per returned filter.
 * Empty when there is nothing to watch. Room ids are human-facing codes minted by
 * `generateGameCode()` from an uppercase A–Z/2–9 alphabet (and the DB primary key is that
 * code), so ids are sanitized to `[A-Z0-9]` — anything else cannot be a real room id and
 * must never reach the filter expression.
 */
export function watchedRoomsRealtimeFilters(ids: readonly string[]): string[] {
  const safe = ids.filter((id) => /^[A-Z0-9]+$/.test(id))
  const filters: string[] = []
  for (let i = 0; i < safe.length; i += WATCHED_ROOM_IDS_MAX) {
    filters.push(`id=in.(${safe.slice(i, i + WATCHED_ROOM_IDS_MAX).join(',')})`)
  }
  return filters
}

export type BrowsableRoom = RoomRow & { memberCount: number }

/** The browse tab shows public, unlocked rooms only. */
export function roomIsBrowsable(room: Pick<RoomRow, 'is_public' | 'is_locked'>): boolean {
  return room.is_public && !room.is_locked
}

export type RoomsRealtimeEvent =
  | { eventType: 'DELETE'; id: string | undefined }
  | { eventType: 'INSERT' | 'UPDATE'; room: RoomRow }

export type RoomsRealtimeResult = {
  /** Next list state. */
  rooms: BrowsableRoom[]
  /** True when the caller should refetch the page from /api/rooms (needs memberCount). */
  reload: boolean
}

/**
 * Pure reducer for a browse-list realtime event. Kept out of the component so the
 * ordering/visibility rules are testable without a live Supabase channel.
 */
export function applyRoomsRealtimeEvent(prev: BrowsableRoom[], event: RoomsRealtimeEvent): RoomsRealtimeResult {
  if (event.eventType === 'DELETE') {
    if (!event.id) return { rooms: prev, reload: false }
    return { rooms: prev.filter((room) => room.id !== event.id), reload: false }
  }

  const { room } = event

  if (!roomIsBrowsable(room)) {
    return { rooms: prev.filter((r) => r.id !== room.id), reload: false }
  }

  if (event.eventType === 'UPDATE') {
    if (!prev.some((r) => r.id === room.id)) {
      // Became visible while off-list (e.g. unlocked) — refetch so memberCount is right.
      return { rooms: prev, reload: true }
    }
    return { rooms: prev.map((r) => (r.id === room.id ? { ...r, ...room } : r)), reload: false }
  }

  // INSERT of a visible room: refetch so the row arrives with its memberCount.
  return { rooms: prev, reload: true }
}
