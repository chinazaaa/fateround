import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrollRunPlayerState, TrollRunSession } from '@/types'
import { assertPlayer } from '@/lib/game-admin'
import { playerIsViewer } from '@/lib/viewers'

/**
 * The in-race authorization guard, kept OUT of `@/lib/troll-run`.
 *
 * `@/lib/troll-run` is imported by client components (the race progress bar, the
 * scoreboard, the player view) for its scoring helpers, so everything it pulls in
 * lands in the browser bundle. This guard calls `assertPlayer`, and through it
 * `@/lib/game-activity`, which uses `after()` from `next/server` — an App-Router
 * server API that cannot be bundled for the client. Same reason `@/lib/push` is
 * only ever imported from route handlers and server drivers.
 *
 * So the guard lives here instead, behind `server-only`, which turns any future
 * client import into an immediate, legible build error rather than a confusing
 * one about `after()`.
 */
export type TrollRunRacingGuard =
  | { ok: false; error: string; status: 400 | 403 | 404 }
  | { ok: true; session: TrollRunSession; state: TrollRunPlayerState }

/**
 * Shared authorization + phase guard for the three in-race report routes.
 *
 * Each route is called from the game loop many times a round, so the checks live here
 * once: the caller is authorized by its secret resume_token (never by a client-supplied
 * player id), viewers are refused, the room really is a Troll Run room that is racing, and
 * the player's row for the current round exists. Callers act only on the returned row.
 */
export async function assertTrollRunRacingPlayer(
  supabase: SupabaseClient,
  gameId: string,
  resumeToken: string
): Promise<TrollRunRacingGuard> {
  const { data: game } = await supabase
    .from('games')
    .select('id,status,game_type,session_started_at')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return { ok: false, error: 'Game not found', status: 404 }
  if (game.game_type !== 'troll_run') return { ok: false, error: 'Not a Troll Run game', status: 400 }
  if (game.status !== 'active') return { ok: false, error: 'Game is not active', status: 400 }

  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error || !auth.player) return { ok: false, error: auth.error ?? 'Unauthorized', status: 403 }
  if (playerIsViewer(auth.player, game)) {
    return { ok: false, error: 'Viewers cannot race', status: 403 }
  }

  const { data: session } = await supabase
    .from('troll_run_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle<TrollRunSession>()

  if (!session) return { ok: false, error: 'Race not found', status: 404 }
  if (session.phase !== 'racing') return { ok: false, error: 'The round is not running', status: 400 }

  const { data: state } = await supabase
    .from('troll_run_player_states')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', auth.player.id)
    .eq('current_round', session.current_round)
    .maybeSingle<TrollRunPlayerState>()

  if (!state) return { ok: false, error: 'You are not in this round', status: 404 }

  return { ok: true, session, state }
}
