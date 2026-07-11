import type { MatchingPairsProgress, MatchingPairsSubmission } from '@fateround/shared'
import {
  MATCHING_PAIRS_POINTS_PER_PAIR,
  MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
} from '@fateround/shared/memory-match'

// Bonus constants — mirror src/lib/memory-match.ts so mobile final standings
// rank players the same way the authoritative web scoring does.
export const MATCHING_PAIRS_PLACEMENT_BONUS = [0, 1500, 1000, 500] as const // [unused, 1st, 2nd, 3rd]
export const MATCHING_PAIRS_PERFECT_GAME_BONUS = 2000
export const MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER = 2
/** Bonus for finishing under the speed par, in points per full minute under par. */
export const MATCHING_PAIRS_SPEED_PAR_BONUS_PER_MINUTE = 200

/**
 * The shared `MatchingPairsProgress` type / progress select omit `finished_at`
 * and `created_at`, but the underlying `memory_match_progress` table has both.
 * The view fetches them via a local extended select and passes rows shaped like
 * this so the speed-par bonus + time-taken can be computed at web parity.
 */
export type MatchingPairsProgressWithTiming = MatchingPairsProgress & {
  finished_at?: string | null
  created_at?: string | null
}

export interface MatchingPairsScore {
  playerId: string
  pairsMatched: number
  wrongAttempts: number
  streakBonusTotal: number
  longestStreak: number
  perfectGame: boolean
  placement: number
  placementBonus: number
  wrongPenaltyTotal: number
  cleanStreakMultiplierBonus: number
  speedParBonus: number
  finalScore: number
  /** Play time in ms (excludes memorize preview). -1 = ran out of time. null = unknown. */
  timeTakenMs: number | null
}

export function matchingPairsPlacementBonus(rank: number): number {
  return MATCHING_PAIRS_PLACEMENT_BONUS[rank] ?? 0
}

/** Face-up preview seconds before the board flips down (mirrors the view). */
const memorizeSecondsFor = (gridSizePairs: number) => (gridSizePairs >= 16 ? 5 : 3)

/**
 * Compute the final score for a player in a single round from their submission
 * history + progress row. Layers placement / perfect-game / clean-streak /
 * speed-par bonuses on top of base + streak, matching the web tally.
 *
 * `sessionStartedAt`/`roundStartedAt`/`timerSeconds` are needed for the speed-par
 * bonus and time-taken (they anchor the finish clock). When the progress row has
 * no `finished_at` (or no anchor), the speed bonus is 0 and time-taken is null —
 * same graceful degradation the web scorer applies.
 */
export function tallyMatchingPairsScore(
  submissions: MatchingPairsSubmission[],
  progress: MatchingPairsProgressWithTiming,
  gridSizePairs: number,
  sessionStartedAt?: string | null,
  roundStartedAt?: string | null,
  timerSeconds?: number | null
): MatchingPairsScore {
  const pairsMatched = submissions.filter((s) => s.is_match).length
  const wrongAttempts = submissions.filter((s) => !s.is_match).length
  const streakBonusTotal = submissions.reduce((acc, s) => acc + (s.streak_bonus ?? 0), 0)

  let maxStreak = 0
  let streak = 0
  for (const s of submissions) {
    if (s.is_match) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else {
      streak = 0
    }
  }

  const perfectGame = progress.finished && wrongAttempts === 0 && pairsMatched === gridSizePairs
  const placement = progress.finish_rank ?? 999
  const placementBonus = matchingPairsPlacementBonus(placement)
  const wrongPenaltyTotal = wrongAttempts * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY
  const cleanStreakMultiplierBonus = perfectGame
    ? placementBonus * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)
    : 0

  const memorizeSeconds = memorizeSecondsFor(gridSizePairs)

  // Speed bonus: only if the player matched ALL pairs and finished before the
  // round's time limit. Uses the round's own start (roundStartedAt) when known,
  // falling back to session_started_at.
  let speedParBonus = 0
  if (progress.finished && progress.finished_at && pairsMatched === gridSizePairs) {
    const timerAnchor = roundStartedAt ?? sessionStartedAt
    if (timerAnchor) {
      const startMs = new Date(timerAnchor).getTime() + memorizeSeconds * 1000
      const elapsedMs = new Date(progress.finished_at).getTime() - startMs
      const playTimerSeconds = timerSeconds != null ? Math.max(0, timerSeconds - memorizeSeconds) : null
      if (playTimerSeconds != null && playTimerSeconds > 0 && elapsedMs >= playTimerSeconds * 1000) {
        // Finished after the time limit — no speed bonus.
      } else if (elapsedMs > 0) {
        const parMs = gridSizePairs * 15 * 1000
        const underParMs = Math.max(0, parMs - elapsedMs)
        const underParMinutes = Math.floor(underParMs / 60000)
        speedParBonus = underParMinutes * MATCHING_PAIRS_SPEED_PAR_BONUS_PER_MINUTE
      }
    }
  }

  const baseScore = pairsMatched * MATCHING_PAIRS_POINTS_PER_PAIR
  let finalScore =
    baseScore +
    streakBonusTotal +
    placementBonus +
    cleanStreakMultiplierBonus +
    speedParBonus +
    (perfectGame ? MATCHING_PAIRS_PERFECT_GAME_BONUS : 0) -
    wrongPenaltyTotal
  if (finalScore < 0) finalScore = 0

  let timeTakenMs: number | null = null
  if (progress.finished_at) {
    const timerAnchor = roundStartedAt ?? sessionStartedAt
    if (timerAnchor) {
      const startMs = new Date(timerAnchor).getTime() + memorizeSeconds * 1000
      timeTakenMs = new Date(progress.finished_at).getTime() - startMs
    } else if (progress.created_at) {
      timeTakenMs = new Date(progress.finished_at).getTime() - new Date(progress.created_at).getTime()
    }
    const playTimerLimit = timerSeconds != null ? Math.max(0, timerSeconds - memorizeSeconds) : null
    if (
      pairsMatched < gridSizePairs &&
      playTimerLimit != null &&
      playTimerLimit > 0 &&
      timeTakenMs !== null &&
      timeTakenMs >= playTimerLimit * 1000
    ) {
      timeTakenMs = -1
    }
  }

  return {
    playerId: progress.player_id,
    pairsMatched,
    wrongAttempts,
    streakBonusTotal,
    longestStreak: maxStreak,
    perfectGame,
    placement,
    placementBonus,
    wrongPenaltyTotal,
    cleanStreakMultiplierBonus,
    speedParBonus,
    finalScore,
    timeTakenMs,
  }
}

export interface MatchingPairsCumulativeRow {
  playerId: string
  finalScore: number
  pairsMatched: number
  wrongAttempts: number
  longestStreak: number
  perfectGame: boolean
  placement: number
  speedParBonusTotal: number
}

/**
 * Cumulative standings across every completed round: score each round via
 * tallyMatchingPairsScore then sum finalScore per player. Passing the timing
 * anchors folds the per-round speed-par bonus into the cumulative total,
 * matching the web `buildCumulativeLeaderboard`.
 */
export function buildCumulativeMatchingPairsScores(
  allSubmissions: MatchingPairsSubmission[],
  allProgress: MatchingPairsProgressWithTiming[],
  gridSizePairs: number,
  sessionStartedAt?: string | null,
  roundStartedAtMap?: Map<string, string>,
  timerSeconds?: number | null
): MatchingPairsCumulativeRow[] {
  const playerIds = new Set(allProgress.map((p) => p.player_id))
  const rows: MatchingPairsCumulativeRow[] = []

  for (const playerId of playerIds) {
    const playerSubs = allSubmissions.filter((s) => s.player_id === playerId)
    const playerProgs = allProgress.filter((p) => p.player_id === playerId)

    const roundIds = new Set<string>()
    for (const s of playerSubs) roundIds.add(s.round_id)
    for (const p of playerProgs) roundIds.add(p.round_id)

    let cumulativeScore = 0
    let cumulativePairs = 0
    let cumulativeWrong = 0
    let longestStreak = 0
    let perfectGame = false
    let placement = 999
    let speedParBonusTotal = 0
    let hasProg = false

    for (const rid of roundIds) {
      const roundProg = playerProgs.find((p) => p.round_id === rid)
      if (!roundProg) continue
      hasProg = true
      const roundSubs = playerSubs.filter((s) => s.round_id === rid)
      const roundStart = roundStartedAtMap?.get(rid) ?? sessionStartedAt
      const score = tallyMatchingPairsScore(
        roundSubs,
        roundProg,
        gridSizePairs,
        sessionStartedAt,
        roundStart,
        timerSeconds
      )
      cumulativeScore += score.finalScore
      cumulativePairs += score.pairsMatched
      cumulativeWrong += score.wrongAttempts
      speedParBonusTotal += score.speedParBonus
      if (score.longestStreak > longestStreak) longestStreak = score.longestStreak
      if (score.perfectGame) perfectGame = true
      if (roundProg.finish_rank !== null && roundProg.finish_rank < placement) {
        placement = roundProg.finish_rank
      }
    }

    if (!hasProg) continue

    rows.push({
      playerId,
      finalScore: cumulativeScore,
      pairsMatched: cumulativePairs,
      wrongAttempts: cumulativeWrong,
      longestStreak,
      perfectGame,
      placement,
      speedParBonusTotal,
    })
  }

  return rows.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    if (a.placement !== b.placement) return a.placement - b.placement
    return a.wrongAttempts - b.wrongAttempts
  })
}
