export {
  WORD_GROUPING_MIN_PLAYERS,
  WORD_GROUPING_MAX_PLAYERS,
  WORD_GROUPING_DEFAULT_MAX_PLAYERS,
  WORD_GROUPING_DEFAULT_DURATION,
  WORD_GROUPING_GAME_DURATION_OPTIONS,
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_TOTAL_GROUPS,
  WORD_GROUPING_WORDS_PER_GROUP,
  WORD_GROUPING_GROUP_POINTS,
  WORD_GROUPING_FIRST_BONUS,
  WORD_GROUPING_MISTAKE_PENALTY,
  WORD_GROUPING_PERFECT_BONUS,
  formatWordGroupingGameDuration,
  tallyWordGroupingScores,
  type WordGroupingGroup,
  type WordGroupingPuzzle,
} from '../../packages/shared/src/word-grouping'

import { WORD_GROUPING_GAME_DURATION_OPTIONS as DURATION_OPTIONS } from '../../packages/shared/src/word-grouping'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'

export function clampWordGroupingGameDuration(seconds: number): number {
  const opts = [...DURATION_OPTIONS]
  let best = opts[0]
  for (const o of opts) {
    if (Math.abs(o - seconds) < Math.abs(best - seconds)) best = o
  }
  return best
}

/**
 * Seconds from the puzzle starting to a player's last correct group — what to show as their
 * time. Null when they never solved one (or the session has no start time), so callers can
 * leave the clock off rather than print a misleading 0:00.
 */
export function wordGroupingFinishSeconds(
  sessionStartedAt: string | null | undefined,
  lastAt: string | null | undefined
): number | null {
  if (!sessionStartedAt || !lastAt) return null
  const secs = Math.floor((new Date(lastAt).getTime() - new Date(sessionStartedAt).getTime()) / 1000)
  return Number.isFinite(secs) ? Math.max(0, secs) : null
}

export async function clearWordGroupingSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['word_grouping_submissions', 'word_grouping_solutions'])
}
