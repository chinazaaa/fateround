import type { SupabaseClient } from '@supabase/supabase-js'

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
  opts?: { resetSpectators?: boolean }
): Promise<{ error: string | null }> {
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: error.message }
  }

  if (opts?.resetSpectators) {
    const { error } = await supabase
      .from('players')
      .update({ spectator: false })
      .eq('game_id', gameId)
      .eq('spectator', true)
    if (error) return { error: error.message }
  }

  return { error: null }
}
