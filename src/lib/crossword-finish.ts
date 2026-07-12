import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { crosswordGameSessionExpired, fillableCellCount, parseCrosswordMetadata } from '@/lib/crossword'
import type { Game } from '@/types'

/**
 * End the game once the time limit passes. Safe to call from any event (no-ops unless the
 * game is active and expired). Errors are returned raw for the caller to sanitize.
 */
export async function finishExpiredCrosswordGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!crosswordGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false
  const { error } = await markGameFinished(supabase, game.id, undefined, { onlyIfActive: true })
  return !error
}

/**
 * Progress-based early finish, called from the submit route after a correct letter (a wrong
 * guess can never complete the grid). Behaviour depends on whether a timer is set:
 *
 *   • No timer  → sudden-death race: the FIRST player to fill every fillable cell ends it.
 *   • Timer set → the timer owns the ending. We only end early if EVERY active player has
 *     finished (nothing left to wait for); otherwise the game runs until it expires so the
 *     rest of the room can keep solving after someone wins.
 */
export async function finishCrosswordIfAnyPlayerDone(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ finished: boolean; error: string | null }> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('status, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return { finished: false, error: gameError.message }
  if (game?.status !== 'active') return { finished: false, error: null }
  const hasTimer = !!game.game_duration_seconds && game.game_duration_seconds > 0

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, crossword_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  if (roundError) return { finished: false, error: roundError.message }

  const meta = parseCrosswordMetadata(round?.crossword_metadata)
  if (!round || !meta) return { finished: false, error: null }
  const fillable = fillableCellCount(meta)
  if (fillable === 0) return { finished: false, error: null }

  const { data: correctSubs, error: subsError } = await supabase
    .from('crossword_submissions')
    .select('player_id, cell_row, cell_col')
    .eq('round_id', round.id)
    .eq('is_correct', true)
  if (subsError) return { finished: false, error: subsError.message }

  const solvedByPlayer = new Map<string, Set<string>>()
  for (const s of (correctSubs ?? []) as { player_id: string; cell_row: number; cell_col: number }[]) {
    const set = solvedByPlayer.get(s.player_id) ?? new Set<string>()
    set.add(`${s.cell_row}-${s.cell_col}`)
    solvedByPlayer.set(s.player_id, set)
  }

  let shouldFinish: boolean
  if (hasTimer) {
    // End early only when every active (non-spectator) player has completed the grid.
    const { data: activePlayers, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('spectator', false)
    if (playersError) return { finished: false, error: playersError.message }
    const playerIds = ((activePlayers ?? []) as { id: string }[]).map((p) => p.id)
    shouldFinish = playerIds.length > 0 && playerIds.every((id) => (solvedByPlayer.get(id)?.size ?? 0) >= fillable)
  } else {
    shouldFinish = [...solvedByPlayer.values()].some((set) => set.size >= fillable)
  }
  if (!shouldFinish) return { finished: false, error: null }

  // Several racers can submit their final cell at once — the onlyIfActive CAS guard makes
  // the active→finished transition award points exactly once.
  const { error: finishError } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  return { finished: !finishError, error: finishError?.message ?? null }
}
