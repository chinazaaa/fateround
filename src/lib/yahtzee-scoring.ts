/**
 * Pure Yahtzee scoring — the score sheet arithmetic, with no session or database concerns.
 *
 * Extracted from `@/lib/yahtzee` so the trophies layer can score a card without importing the
 * whole game module, which dragged in `@/lib/game-finish` -> `@/lib/trophies/round-facts` ->
 * the game-facts barrel -> back again. See `@/lib/ludo-pieces` for why that cycle is worth removing.
 *
 * Keep this a LEAF: types only, no value imports from game-logic modules.
 */
import type { YahtzeeCategory, YahtzeeCategoryPoints } from '@/types'

export const YAHTZEE_UPPER_BONUS_THRESHOLD = 63
export const YAHTZEE_UPPER_BONUS_POINTS = 35
/** Flat points for each extra Yahtzee after the first (standard Hasbro Yahtzee Bonus). */
export const YAHTZEE_BONUS_POINTS = 100

export const YAHTZEE_LOWER_CATEGORIES: YahtzeeCategory[] = [
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
]

export function upperScore(points: YahtzeeCategoryPoints): number {
  return (
    (points.ones ?? 0) +
    (points.twos ?? 0) +
    (points.threes ?? 0) +
    (points.fours ?? 0) +
    (points.fives ?? 0) +
    (points.sixes ?? 0)
  )
}

export function upperBonus(points: YahtzeeCategoryPoints): number {
  const u = upperScore(points)
  return u >= YAHTZEE_UPPER_BONUS_THRESHOLD ? YAHTZEE_UPPER_BONUS_POINTS : 0
}

export function totalScore(points: YahtzeeCategoryPoints, bonusYahtzees = 0): number {
  const lower =
    (points.three_kind ?? 0) +
    (points.four_kind ?? 0) +
    (points.full_house ?? 0) +
    (points.small_straight ?? 0) +
    (points.large_straight ?? 0) +
    (points.yahtzee ?? 0) +
    (points.chance ?? 0)

  // Each Yahtzee Bonus is a flat 100, scored separately from the categories.
  return upperScore(points) + upperBonus(points) + lower + Math.max(0, bonusYahtzees) * YAHTZEE_BONUS_POINTS
}
