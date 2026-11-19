import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { WORD_GROUPING_MAX_MISTAKES, WORD_GROUPING_TOTAL_GROUPS } from '@/lib/word-grouping'

export function isWordGroupingPlayerDone(correctCount: number | undefined, mistakeCount: number | undefined): boolean {
  return (correctCount ?? 0) >= WORD_GROUPING_TOTAL_GROUPS || (mistakeCount ?? 0) >= WORD_GROUPING_MAX_MISTAKES
}

/**
 * Finishes the game if every non-spectator is done. `error` is set when completion failed (so a
 * caller can retry); `allDone` says whether the roster was complete (the game is then finished,
 * either by this call or by whoever won the compare-and-swap first).
 */
export async function finishWordGroupingIfAllDone(
  supabase: SupabaseClient,
  code: string,
  roundId: string,
  sessionStartedAt: string | null
): Promise<{ error: Error | null; allDone: boolean }> {
  try {
    const { data: allPlayers, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', code)
      .eq('spectator', false)
    if (playersError) return { error: new Error(`players read failed: ${playersError.message}`), allDone: false }
    if (!allPlayers) return { error: null, allDone: false }

    const { data: allSubs, error: subsError } = await supabase
      .from('word_grouping_submissions')
      .select('player_id, is_correct')
      .eq('round_id', roundId)
    if (subsError) return { error: new Error(`submissions read failed: ${subsError.message}`), allDone: false }

    const allDone = allPlayers.every((p) => {
      const playerSubs = allSubs?.filter((s) => s.player_id === p.id) ?? []
      const pCorrect = playerSubs.filter((s) => s.is_correct).length
      const pMistakes = playerSubs.filter((s) => !s.is_correct).length
      return isWordGroupingPlayerDone(pCorrect, pMistakes)
    })
    if (!allDone) return { error: null, allDone: false }

    // Several callers can independently observe "allDone" (final submits, the client nudge, the
    // sweep). onlyIfActive lets only the CAS winner run the finish side-effects, and
    // onlySessionStartedAt keeps a stale check from finishing a replay under the same game id.
    const result = await markGameFinished(supabase, code, new Date().toISOString(), {
      onlyIfActive: true,
      onlySessionStartedAt: sessionStartedAt,
    })
    return result.error
      ? { error: new Error(`markGameFinished failed: ${result.error}`), allDone: true }
      : { error: null, allDone: true }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)), allDone: false }
  }
}

/**
 * Independent recovery for a completion that failed after the final guess was committed: re-run the
 * completion check for one game with no submission involved. A no-op unless the game is an active
 * Word Grouping game whose roster is all done. Used by the /complete endpoint (a client nudge) and
 * by the server sweep, so an untimed game never has to wait for the idle reaper (and end with
 * `idle_timeout`) just because the first finish attempt failed.
 */
export async function settleWordGroupingGame(
  supabase: SupabaseClient,
  code: string
): Promise<{ finished: boolean; error?: Error }> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status, session_started_at')
    .eq('id', code)
    .maybeSingle()
  if (gameError) return { finished: false, error: new Error(`game read failed: ${gameError.message}`) }
  if (!game || game.status !== 'active') return { finished: false }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  if (roundError) return { finished: false, error: new Error(`round read failed: ${roundError.message}`) }
  if (!round) return { finished: false }

  const { error, allDone } = await finishWordGroupingIfAllDone(supabase, code, round.id, game.session_started_at)
  if (error) return { finished: false, error }
  return { finished: allDone }
}

/**
 * Server-side backstop: settle every active Word Grouping game (oldest activity first, bounded per
 * call). Needs no client, so it also covers a game whose players have all left.
 */
export async function settleAllWordGroupingGames(
  supabase: SupabaseClient,
  limit = 50
): Promise<{ finished: number; failed: number }> {
  const { data, error } = await supabase
    .from('games')
    .select('id')
    .eq('game_type', 'word_grouping')
    .eq('status', 'active')
    .order('last_activity_at', { ascending: true })
    .limit(limit)
  if (error) return { finished: 0, failed: 1 }
  let finished = 0
  let failed = 0
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const result = await settleWordGroupingGame(supabase, row.id)
    if (result.error) failed += 1
    else if (result.finished) finished += 1
  }
  return { finished, failed }
}
