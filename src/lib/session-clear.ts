import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'

/**
 * Delete a game's per-game session rows from `tables` (matched by `game_id`), in the
 * given order, and optionally reset any spectators back to active players.
 *
 * Replaces ~12 near-identical `clear*SessionData` bodies and unifies their return type
 * (some returned `{ error?: string }`, others `{ error: string | null }` — both are
 * falsy-checked by callers, so this is behaviour-preserving). Returns the first error
 * encountered, or `{ error: null }` on success.
 */
export async function clearSessionTables(
  supabase: SupabaseClient,
  gameId: string,
  tables: readonly string[],
  opts?: {
    resetSpectators?: boolean
    // Delete only rows created at or before this instant (every table passed must have `created_at`): a
    // session-bound wipe that must never reach rows a replayed session wrote after the one it cleans up.
    createdAtOrBefore?: string
  }
): Promise<{ error: string | null }> {
  for (const table of tables) {
    let query = supabase.from(table).delete().eq('game_id', gameId)
    if (opts?.createdAtOrBefore) query = query.lte('created_at', opts.createdAtOrBefore)
    const { error } = await query
    if (error) return { error: internalErrorMessage('session-clear', error) }
  }

  if (opts?.resetSpectators) {
    const { error } = await supabase
      .from('players')
      .update({ spectator: false })
      .eq('game_id', gameId)
      .eq('spectator', true)
      .eq('is_eliminated', false)
    if (error) return { error: internalErrorMessage('session-clear', error) }
  }

  return { error: null }
}
