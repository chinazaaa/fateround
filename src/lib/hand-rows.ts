/**
 * Client-side merging of Realtime rows from the per-player hand tables (Whot, UNO, Crazy Eights,
 * Bingo) — the counterpart to lib/hand-redaction.ts, which does the server half.
 *
 * Once `cards` is revoked from anon, a `postgres_changes` payload for these tables carries
 * NEITHER `cards` NOR a count (`card_count` is computed by the redaction route, not a column).
 * Two failure modes follow, and every game view hits both, which is why this lives here rather
 * than being re-derived per game:
 *
 *   1. Applying the payload verbatim blanks the hand — and since `isOut` is derived from an
 *      empty hand, a live player reads as OUT. Handled by keeping the last known count
 *      ({@link mergeHandRow}).
 *   2. Keeping the last known count forever FREEZES opponents' card counts for the rest of the
 *      game: with realtime connected the safety-net poll is disabled, so nothing ever corrects
 *      them and the "UNO!" cue never fires. Handled by {@link pushedCardCount} returning null,
 *      which the view turns into "not absorbed" so useGameTableSync runs its debounced
 *      reconciling reload — the only path that can learn the new count.
 */

export interface HandRowLike {
  id: string
  player_id: string
  player_order: number
  cards?: unknown
  card_count?: number
}

/**
 * The card count this pushed row actually carries, or `null` when it carries none — i.e. the row
 * is redacted and the count can only come from the authorized route.
 *
 * `null` means "unknown", never "zero": zero is meaningful state in these games ("this player is
 * out"), and conflating the two is the bug this programme keeps re-finding.
 */
export function pushedCardCount(row: { cards?: unknown; card_count?: number | null }): number | null {
  if (typeof row.card_count === 'number') return row.card_count
  if (Array.isArray(row.cards)) return row.cards.length
  return null
}

/**
 * Merge a pushed hand row into local state, keeping the row list ordered by `player_order`.
 *
 * When the payload carries no count, the previously known one is carried forward so an opponent
 * never momentarily renders as holding zero cards. That is a stopgap, not a fix: the caller must
 * still let the reconciling reload run (see `pushedCardCount`), or the stale count sticks.
 */
export function mergeHandRow<T extends HandRowLike>(prev: T[], next: T): T[] {
  const i = prev.findIndex((h) => h.id === next.id)
  const merged: T = { ...next, card_count: pushedCardCount(next) ?? prev[i]?.card_count } as T
  if (i === -1) return [...prev, merged].sort((a, b) => a.player_order - b.player_order)
  const copy = [...prev]
  copy[i] = merged
  return copy
}
