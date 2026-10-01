import type { Game } from '@fateround/shared'

/**
 * Mirror of src/lib/realtime-merge.ts — keep the two in step.
 *
 * Columns set at config time that never legitimately become null mid-game. Supabase Realtime
 * omits unchanged TOAST-ed columns from UPDATE payloads: a large jsonb value stored out-of-line
 * arrives as `null` on any update that didn't touch it, so for these `null` means "unchanged",
 * not "cleared".
 */
const TOAST_PRONE = ['custom_questions', 'ai_generated_questions', 'custom_slots'] as const

/**
 * Merge a realtime `games` UPDATE payload over the previous game.
 *
 * A PATCH, not a replacement, tolerating two kinds of missing:
 *
 *  - **`undefined` — the column is not published.** A publication column list makes Realtime
 *    deliver only the listed columns; the rest are absent from the payload. Absent must never
 *    overwrite a known value, or narrowing a publication silently blanks client state.
 *  - **`null` on a TOAST-prone column — unchanged, not cleared.**
 *
 * Everything else in the payload wins, including a genuine `null` on an ordinary column.
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
