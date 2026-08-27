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
 * Merge a realtime `games` UPDATE payload over the previous game.
 *
 * This is a PATCH, not a replacement, and it has to tolerate two different kinds of missing:
 *
 *  - **`undefined` — the column is not published.** A publication column list (see the
 *    `games` migration, and 20261110120000 for `monopoly_boards`) makes Realtime deliver only
 *    the listed columns; everything else is simply absent from the payload object. Absent must
 *    never overwrite a known value, or narrowing a publication silently blanks client state.
 *  - **`null` on a TOAST-prone column — unchanged, not cleared.** See above.
 *
 * Everything else in the payload wins, including a genuine `null` on an ordinary column (that is
 * a real clear — e.g. `finished_at` being reset by play-again).
 *
 * `prev === null` returns the payload as-is: there is nothing to merge onto, and the initial
 * load that populates `prev` is what makes subsequent payloads sufficient.
 */
export function mergeRealtimeGame(prev: Game | null, next: Partial<Game>): Game {
  if (!prev) return next as Game
  const merged: Record<string, unknown> = { ...prev }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    if (value === null && (TOAST_PRONE as readonly string[]).includes(key)) continue
    merged[key] = value
  }
  return merged as unknown as Game
}
