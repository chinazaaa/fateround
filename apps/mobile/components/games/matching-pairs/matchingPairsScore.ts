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
  finalScore: number
}

export function matchingPairsPlacementBonus(rank: number): number {
  return MATCHING_PAIRS_PLACEMENT_BONUS[rank] ?? 0
}

/**
 * Compute the final score for a player in a single round from their submission
 * history + progress row. Layers placement / perfect-game / clean-streak
 * bonuses on top of base + streak, matching the web tally.
 *
 * NOTE: the mobile progress select omits `finished_at`/`created_at`, so the
 * speed-par bonus (which needs a finish timestamp) is not computed here — it is
 * always 0. Everything else is at parity with the web scoring.
 */
export function tallyMatchingPairsScore(
  submissions: MatchingPairsSubmission[],
  progress: MatchingPairsProgress,
  gridSizePairs: number
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

  const baseScore = pairsMatched * MATCHING_PAIRS_POINTS_PER_PAIR
  let finalScore =
    baseScore +
    streakBonusTotal +
    placementBonus +
    cleanStreakMultiplierBonus +
    (perfectGame ? MATCHING_PAIRS_PERFECT_GAME_BONUS : 0) -
    wrongPenaltyTotal
  if (finalScore < 0) finalScore = 0

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
    finalScore,
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
}

/**
 * Cumulative standings across every completed round: score each round via
 * tallyMatchingPairsScore then sum finalScore per player.
 */
export function buildCumulativeMatchingPairsScores(
  allSubmissions: MatchingPairsSubmission[],
  allProgress: MatchingPairsProgress[],
  gridSizePairs: number
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
    let hasProg = false

    for (const rid of roundIds) {
      const roundProg = playerProgs.find((p) => p.round_id === rid)
      if (!roundProg) continue
      hasProg = true
      const roundSubs = playerSubs.filter((s) => s.round_id === rid)
      const score = tallyMatchingPairsScore(roundSubs, roundProg, gridSizePairs)
      cumulativeScore += score.finalScore
      cumulativePairs += score.pairsMatched
      cumulativeWrong += score.wrongAttempts
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
    })
  }

  return rows.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    if (a.placement !== b.placement) return a.placement - b.placement
    return a.wrongAttempts - b.wrongAttempts
  })
}
