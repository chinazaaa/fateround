import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { countEmptyCells, parseSudokuMetadata } from '@/lib/sudoku'

/**
 * End the game once every active (non-spectator) player has solved every empty
 * cell. Sudoku rounds keep participant_ids empty, so completion is measured
 * against the live player roster: late joiners extend the game, and a player
 * who leaves stops blocking it — which is why player removal re-checks too.
 *
 * Safe to call from any event (no-ops unless the game is active); errors are
 * returned raw for the caller to sanitize.
 */
export async function finishSudokuIfAllPlayersDone(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ finished: boolean; error: string | null }> {
  const { data: game, error: gameError } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
  if (gameError) return { finished: false, error: gameError.message }
  if (game?.status !== 'active') return { finished: false, error: null }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, sudoku_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  if (roundError) return { finished: false, error: roundError.message }

  const meta = parseSudokuMetadata(round?.sudoku_metadata)
  if (!round || !meta) return { finished: false, error: null }
  const emptyCellsCount = countEmptyCells(meta.puzzle)

  const { data: activePlayers, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('spectator', false)
  if (playersError) return { finished: false, error: playersError.message }

  const playerIds = ((activePlayers ?? []) as { id: string }[]).map((p) => p.id)
  if (playerIds.length === 0) return { finished: false, error: null }

  const { data: correctSubs, error: subsError } = await supabase
    .from('sudoku_submissions')
    .select('player_id, cell_row, cell_col')
    .eq('round_id', round.id)
    .eq('is_correct', true)
  if (subsError) return { finished: false, error: subsError.message }

  const solvedByPlayer = new Map<string, Set<string>>()
  for (const s of (correctSubs ?? []) as { player_id: string; cell_row: number | null; cell_col: number | null }[]) {
    if (s.cell_row == null || s.cell_col == null) continue
    const set = solvedByPlayer.get(s.player_id) ?? new Set<string>()
    set.add(`${s.cell_row}-${s.cell_col}`)
    solvedByPlayer.set(s.player_id, set)
  }

  const allDone = playerIds.every((id) => (solvedByPlayer.get(id)?.size ?? 0) >= emptyCellsCount)
  if (!allDone) return { finished: false, error: null }

  const { error: finishError } = await markGameFinished(supabase, gameId)
  return { finished: !finishError, error: finishError?.message ?? null }
}
