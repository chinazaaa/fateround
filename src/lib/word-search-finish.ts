import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { wordSearchGameSessionExpired, parseWordSearchMetadata } from '@/lib/word-search'
import type { Game } from '@/types'

/**
 * End the game once the time limit passes. Safe to call from any event (no-ops unless the
 * game is active and expired).
 */
export async function finishExpiredWordSearchGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!wordSearchGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false
  const { error } = await markGameFinished(supabase, game.id, undefined, { onlyIfActive: true })
  return !error
}

/**
 * Progress-based early finish, called from the found route after a valid new find. Behaviour
 * depends on whether a timer is set:
 *
 *   • No timer  → sudden-death race: the FIRST player to find every word ends the hunt.
 *   • Timer set → the timer owns the ending. We only end early if EVERY active player has
 *     found every word; otherwise the hunt runs until it expires so the rest of the room can
 *     keep searching after someone wins.
 */
export async function finishWordSearchIfAnyPlayerDone(
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
    .select('id, word_search_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  if (roundError) return { finished: false, error: roundError.message }

  const meta = parseWordSearchMetadata(round?.word_search_metadata)
  if (!round || !meta) return { finished: false, error: null }
  const totalWords = meta.words.length
  if (totalWords === 0) return { finished: false, error: null }

  const { data: foundRows, error: foundError } = await supabase
    .from('word_search_found')
    .select('player_id, word')
    .eq('round_id', round.id)
  if (foundError) return { finished: false, error: foundError.message }

  const wordsByPlayer = new Map<string, Set<string>>()
  for (const f of (foundRows ?? []) as { player_id: string; word: string }[]) {
    const set = wordsByPlayer.get(f.player_id) ?? new Set<string>()
    set.add(f.word)
    wordsByPlayer.set(f.player_id, set)
  }

  let shouldFinish: boolean
  if (hasTimer) {
    // End early only when every active (non-spectator) player has found every word.
    const { data: activePlayers, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('spectator', false)
    if (playersError) return { finished: false, error: playersError.message }
    const playerIds = ((activePlayers ?? []) as { id: string }[]).map((p) => p.id)
    shouldFinish = playerIds.length > 0 && playerIds.every((id) => (wordsByPlayer.get(id)?.size ?? 0) >= totalWords)
  } else {
    shouldFinish = [...wordsByPlayer.values()].some((set) => set.size >= totalWords)
  }
  if (!shouldFinish) return { finished: false, error: null }

  // Several racers can submit their final find at once — the onlyIfActive CAS guard makes the
  // active→finished transition award points exactly once.
  const { error: finishError } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  return { finished: !finishError, error: finishError?.message ?? null }
}
