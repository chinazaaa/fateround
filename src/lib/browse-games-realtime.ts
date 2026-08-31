import type { BrowseGameRow, PublicGame } from '@/lib/game-browse'

/**
 * Server-side filter for the /browse games realtime channel.
 *
 * The browse list only ever shows games where `is_public && max_players >= 2` and whose
 * status matches the visible tab (see `gameIsBrowsable`), but the subscription used to be
 * `{ event: '*', table: 'games' }` with NO filter. Every visitor sitting on /browse
 * therefore received an event for every `games` INSERT/UPDATE/DELETE across the whole
 * platform — and `games` rows are written constantly during any active game. A single
 * `games` UPDATE was measured at a 12,275 byte realtime wire frame per subscriber.
 *
 * Supabase realtime filters are single-column and support only `eq/neq/gt/gte/lt/lte/in`,
 * so `is_public AND max_players >= 2 AND status <> 'finished'` is not expressible. We
 * filter on `is_public`, which is by far the most selective of the three: it defaults to
 * false and the overwhelming majority of games on the platform are private, so this drops
 * nearly all of the firehose. The `max_players` and `status` checks stay client-side in
 * `gameIsBrowsable` — and they have to, because a game leaving the list (finishing, going
 * private) must still deliver the event that removes it.
 */
export const PUBLIC_GAMES_REALTIME_FILTER = 'is_public=eq.true'

/** Which browse tab the list is showing; decides which statuses qualify. */
export type BrowseTab = 'live' | 'upcoming'

/**
 * Shape of a `games` realtime payload row, as far as the browse list cares. Anon holds
 * column-level SELECT on every `games` column except `host_token`, so all of these are
 * present in `payload.new`.
 */
export type GamesRealtimeRow = BrowseGameRow & { is_public?: boolean | null }

/**
 * Mirrors the server-side predicate in `GET /api/games`:
 *   .eq('is_public', true).gte('max_players', 2)
 *   live     → .neq('status', 'finished').neq('status', 'scheduled')
 *   upcoming → .eq('status', 'scheduled')
 *
 * `.gte('max_players', 2)` also excludes NULL (SQL NULL >= 2 is unknown), so a null
 * max_players is NOT browsable — matching what the API actually returns.
 */
export function gameIsBrowsable(row: GamesRealtimeRow, tab: BrowseTab): boolean {
  if (row.is_public !== true) return false
  if (row.max_players == null || row.max_players < 2) return false
  return tab === 'upcoming' ? row.status === 'scheduled' : row.status !== 'finished' && row.status !== 'scheduled'
}

/**
 * Copy only the columns the browse list renders off a realtime payload.
 *
 * The payload carries the whole row (~every non-secret `games` column); merging it wholesale
 * into list state would smuggle dozens of unrelated fields into `PublicGame`.
 */
export function pickBrowseFields(row: GamesRealtimeRow): BrowseGameRow {
  return {
    id: row.id,
    title: row.title,
    game_type: row.game_type,
    status: row.status,
    max_players: row.max_players,
    allow_late_players: row.allow_late_players,
    created_at: row.created_at,
    scheduled_at: row.scheduled_at,
  }
}

export type BrowseGamesRealtimeEvent =
  | { eventType: 'DELETE'; id: string | undefined }
  | { eventType: 'INSERT' | 'UPDATE'; row: GamesRealtimeRow }

export type BrowseGamesRealtimeResult = {
  /** Next list state. */
  games: PublicGame[]
  /** True when the caller must refetch page 1 from /api/games (needs playerCount + ordering). */
  reload: boolean
}

/**
 * Pure reducer for one browse-list realtime event.
 *
 * The old handler threw the payload away and ran a full `loadGames()` on EVERY event. Most
 * events are in-place updates to a row already on screen (status flips, settings changes),
 * and those are applied locally here for zero extra reads.
 *
 * A refetch is still required in exactly two cases, and cannot be avoided:
 *   - a game becomes browsable while off-list (INSERT, or an UPDATE that flips it public /
 *     un-finishes it). The realtime payload has no `playerCount`/`viewerCount` — those come
 *     from a separate aggregate query — and the list is cursor-paginated with a server-side
 *     ORDER BY, so we cannot soundly decide where (or whether) the row belongs on page 1.
 *     Splicing it in locally would corrupt the cursor.
 * The caller debounces those refetches so a burst of events is still one read.
 */
export function applyBrowseGamesRealtimeEvent(
  prev: PublicGame[],
  event: BrowseGamesRealtimeEvent,
  tab: BrowseTab
): BrowseGamesRealtimeResult {
  if (event.eventType === 'DELETE') {
    if (!event.id) return { games: prev, reload: false }
    return { games: prev.filter((game) => game.id !== event.id), reload: false }
  }

  const { row } = event

  if (!gameIsBrowsable(row, tab)) {
    // Left the list (finished, went private, seats dropped below 2). Remove it locally —
    // no refetch needed, and this is the common "game ends" case.
    const next = prev.filter((game) => game.id !== row.id)
    return { games: next, reload: false }
  }

  if (event.eventType === 'UPDATE') {
    if (!prev.some((game) => game.id === row.id)) {
      // Became visible while off-list — refetch so it arrives with its attendance counts
      // and in the server's sort position.
      return { games: prev, reload: true }
    }
    const fields = pickBrowseFields(row)
    return { games: prev.map((game) => (game.id === row.id ? { ...game, ...fields } : game)), reload: false }
  }

  // INSERT of a browsable game: refetch (needs playerCount, and page-1 placement).
  return { games: prev, reload: true }
}
