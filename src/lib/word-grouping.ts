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

import {
  WORD_GROUPING_GAME_DURATION_OPTIONS as DURATION_OPTIONS,
  WORD_GROUPING_DEFAULT_DURATION as DEFAULT_DURATION,
} from '../../packages/shared/src/word-grouping'

export function clampWordGroupingGameDuration(seconds: number): number {
  // Guard: `Math.abs(NaN - x)` is NaN → every comparison is false → `best` sticks at opts[0]
  // (which is 0 = "No limit"). A missing or NaN input should fall back to the platform default,
  // not silently disable the timer.
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION
  const opts = [...DURATION_OPTIONS]
  let best = opts[0]
  let bestDist = Math.abs(best - seconds)
  for (const o of opts) {
    const dist = Math.abs(o - seconds)
    // `<=` so a tie prefers the LATER option (higher-index = longer timer): with the previous
    // strict `<`, `seconds = 60` snapped to 0 (No limit) rather than 120s, because both were
    // 60 away and the first-seen won. Ordering the options ascending keeps this deterministic.
    if (dist <= bestDist) {
      best = o
      bestDist = dist
    }
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
