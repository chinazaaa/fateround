import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { wordScrambleGameSessionExpired, parseWordScrambleMetadata } from '@/lib/word-scramble'
import type { Game } from '@/types'

/**
 * End the game once the time limit passes. Safe to call from any event (no-ops unless the
 * game is active and expired).
 */
export async function finishExpiredWordScrambleGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!wordScrambleGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false
  const { error } = await markGameFinished(supabase, game.id, undefined, { onlyIfActive: true })
  return !error
}

/**
 * Progress-based early finish, called from the submit route after a correct unscramble.
 *   • No timer  → sudden-death race: the FIRST player to solve every scramble ends it.
 *   • Timer set → the timer owns the ending. We only end early if EVERY active player has
 *     solved everything; otherwise the round runs until it expires so the rest can keep going.
 */
export async function finishWordScrambleIfAnyPlayerDone(
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
    .select('id, word_scramble_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  if (roundError) return { finished: false, error: roundError.message }

  const meta = parseWordScrambleMetadata(round?.word_scramble_metadata)
  if (!round || !meta) return { finished: false, error: null }
  const total = meta.count
  if (total === 0) return { finished: false, error: null }

  const { data: solveRows, error: solveError } = await supabase
    .from('word_scramble_solves')
    .select('player_id, scramble_index')
    .eq('round_id', round.id)
  if (solveError) return { finished: false, error: solveError.message }

  const byPlayer = new Map<string, Set<number>>()
  for (const s of (solveRows ?? []) as { player_id: string; scramble_index: number }[]) {
    const set = byPlayer.get(s.player_id) ?? new Set<number>()
    set.add(s.scramble_index)
    byPlayer.set(s.player_id, set)
  }

  let shouldFinish: boolean
  if (hasTimer) {
    const { data: activePlayers, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('spectator', false)
    if (playersError) return { finished: false, error: playersError.message }
    const playerIds = ((activePlayers ?? []) as { id: string }[]).map((p) => p.id)
    shouldFinish = playerIds.length > 0 && playerIds.every((id) => (byPlayer.get(id)?.size ?? 0) >= total)
  } else {
    shouldFinish = [...byPlayer.values()].some((set) => set.size >= total)
  }
  if (!shouldFinish) return { finished: false, error: null }

  const { error: finishError } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  return { finished: !finishError, error: finishError?.message ?? null }
}
