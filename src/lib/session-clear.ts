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
  opts?: { resetSpectators?: boolean }
): Promise<{ error: string | null }> {
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
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

/**
 * Wipe the per-session rows of a FINISHED session ('anonymous': messages and bans; 'codewords': chat), decided
 * atomically in the database: the function locks the games row, deletes only while the game is still finished with
 * exactly the `finishedAt` the caller's finish wrote, and deletes everything of that session. A replayed (Play
 * Again) game is never touched, and no created_at is compared against an app-clock value. Message inserts take the
 * same lock (see insert_anonymous_message_if_active / insert_codewords_message_if_active), so nothing accepted for the
 * session can land after this wipe. Idempotent.
 */
export async function wipeFinishedSession(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt: string,
  kind: 'anonymous' | 'codewords'
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('wipe_finished_session_rows', {
    p_game_id: gameId,
    p_finished_at: finishedAt,
    p_kind: kind,
  })
  return { error: error ? internalErrorMessage('session-clear', error) : null }
}
