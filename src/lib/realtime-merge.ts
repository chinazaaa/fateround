import type { Game } from '@/types'

/**
 * Columns set at config time that never legitimately become null mid-game.
 *
 * Supabase Realtime omits unchanged TOAST-ed columns from UPDATE payloads — a large jsonb value
 * stored out-of-line arrives as `null` on any update that didn't touch it. Pick-a-Number reads
 * `game.custom_questions` live to size its picker grid, so a round advance (which updates
 * current_round_number and leaves custom_questions untouched) would otherwise null the pool and
 * break the picker. For these, `null` means "unchanged", not "cleared".
 */
const TOAST_PRONE = ['custom_questions', 'ai_generated_questions', 'custom_slots'] as const

/**
 * Merge a realtime UPDATE payload over the previous row.
 *
 * This is a PATCH, not a replacement, and it has to tolerate two different kinds of missing:
 *
 *  - **`undefined` — the column is not published.** A publication column list (see the
 *    `games` migration, and 20261110120000 for `monopoly_boards`) makes Realtime deliver only
 *    the listed columns; everything else is simply absent from the payload object. Absent must
 *    never overwrite a known value, or narrowing a publication silently blanks client state.
 *  - **`null` on a TOAST-prone column — unchanged, not cleared.** See {@link TOAST_PRONE}.
 *
 * Everything else in the payload wins, including a genuine `null` on an ordinary column (that is
 * a real clear — e.g. `finished_at` being reset by play-again).
 *
 * Basing the merge on `prev` rather than on the payload is what handles the first case: a
 * payload-based spread (`{ ...prev, ...next }`) carries absent keys through as `undefined` and a
 * `{ ...next }` base drops them entirely.
 *
 * `prev === null` returns the payload as-is: there is nothing to merge onto, and the initial
 * load that populates `prev` is what makes subsequent payloads sufficient.
 */
export function mergeRealtimeRow<T>(prev: T | null, next: Record<string, unknown>, toastProne: readonly string[]): T {
  if (!prev) return next as T
  const merged: Record<string, unknown> = { ...prev }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    if (value === null && toastProne.includes(key)) continue
    merged[key] = value
  }
  return merged as T
}

/** {@link mergeRealtimeRow} for a `games` payload. */
export function mergeRealtimeGame(prev: Game | null, next: Partial<Game>): Game {
  return mergeRealtimeRow<Game>(prev, next as Record<string, unknown>, TOAST_PRONE)
}

/**
 * `rummy_sessions` columns that arrive as `null` when an UPDATE did not touch them.
 *
 * The piles are the only TOAST-eligible columns in that table, which is why they are excluded
 * from `RUMMY_SESSION_NOT_NULL_KEYS` (see `supabase-selects.ts`) — and excluding them from the
 * completeness gate is exactly what makes carrying them forward here necessary.
 */
export const RUMMY_SESSION_TOAST_PRONE = ['draw_pile', 'discard_pile'] as const
