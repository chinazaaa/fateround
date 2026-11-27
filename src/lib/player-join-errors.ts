/**
 * Rejections raised by the `players_enforce_join_rules` BEFORE INSERT trigger
 * (supabase/migrations/20261203700000_players_join_rules_trigger.sql).
 *
 * POST /api/players checks the seat cap and the name before inserting, but two joins that both pass the
 * check used to both insert. The trigger now re-checks under a per-game lock and refuses the loser with a
 * dedicated SQLSTATE; the route turns that back into the same 400 it returns when its own pre-check fails.
 */

/** SQLSTATE: the lobby has no open seat for a non-spectator. */
export const PLAYER_JOIN_LOBBY_FULL_CODE = 'PJ001'
/** SQLSTATE: another player in the game already has this name (and the game is not a team game). */
export const PLAYER_JOIN_NAME_TAKEN_CODE = 'PJ002'

export type PlayerJoinRejection = 'lobby_full' | 'name_taken'

/**
 * Classify a failed `players` insert. Returns null for anything else (a genuine failure the caller should
 * report as an internal error). Matches the SQLSTATE first, and the trigger's message as a fallback for
 * transports that drop the code.
 */
export function playerJoinRejection(error: unknown): PlayerJoinRejection | null {
  if (!error || typeof error !== 'object') return null
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === PLAYER_JOIN_LOBBY_FULL_CODE || message === 'players_join_lobby_full') return 'lobby_full'
  if (code === PLAYER_JOIN_NAME_TAKEN_CODE || message === 'players_join_name_taken') return 'name_taken'
  return null
}
