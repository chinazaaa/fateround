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
 * Race win condition: the first player to find EVERY listed word ends the game. Called from
 * the found route only after a valid new find — nothing else can complete the hunt.
 */
export async function finishWordSearchIfAnyPlayerDone(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ finished: boolean; error: string | null }> {
  const { data: game, error: gameError } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
  if (gameError) return { finished: false, error: gameError.message }
  if (game?.status !== 'active') return { finished: false, error: null }

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

  const anyoneDone = [...wordsByPlayer.values()].some((set) => set.size >= totalWords)
  if (!anyoneDone) return { finished: false, error: null }

  // Several racers can submit their final find at once — the onlyIfActive CAS guard makes the
  // active→finished transition award points exactly once.
  const { error: finishError } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  return { finished: !finishError, error: finishError?.message ?? null }
}
