import type { YahtzeeCategory, YahtzeeCategoryPoints, YahtzeeSession } from './types'

export const YAHTZEE_MIN_PLAYERS = 1
export const YAHTZEE_MAX_PLAYERS = 6
export const YAHTZEE_DEFAULT_MAX_PLAYERS = 6

export const YAHTZEE_DICE_COUNT = 5
export const YAHTZEE_ROLLS_PER_TURN = 3

export const YAHTZEE_UPPER_BONUS_THRESHOLD = 63
export const YAHTZEE_UPPER_BONUS_POINTS = 35
/** Flat points for each extra Yahtzee after the first (standard Hasbro Yahtzee Bonus). */
export const YAHTZEE_BONUS_POINTS = 100

export const YAHTZEE_CATEGORY_LABELS: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  three_kind: '3 of a Kind',
  four_kind: '4 of a Kind',
  full_house: 'Full House',
  small_straight: 'Sm. Straight',
  large_straight: 'Lg. Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

export const YAHTZEE_UPPER_CATEGORIES: YahtzeeCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']

export const YAHTZEE_LOWER_CATEGORIES: YahtzeeCategory[] = [
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
]

export const YAHTZEE_ALL_CATEGORIES: YahtzeeCategory[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
]

export function emptyCategoryPoints(): YahtzeeCategoryPoints {
  return {
    ones: null,
    twos: null,
    threes: null,
    fours: null,
    fives: null,
    sixes: null,
    three_kind: null,
    four_kind: null,
    full_house: null,
    small_straight: null,
    large_straight: null,
    yahtzee: null,
    chance: null,
  }
}

export function countFaces(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d] += 1
  }
  return counts
}

export function rollUnheldDice(dice: number[], held: boolean[]): number[] {
  return dice.map((d, i) => (held[i] ? d : Math.floor(Math.random() * 6) + 1))
}

function isConsecutiveRun(dice: number[], run: number[]): boolean {
  const unique = new Set(dice)
  return run.every((n) => unique.has(n))
}

export function categoryScore(
  dice: number[],
  category: YahtzeeCategory,
  // When the Joker rule is in force (a Yahtzee scored after the Yahtzee box is filled), the
  // three lower combination boxes fill at their MAX regardless of the dice — a Joker Yahtzee
  // counts as a Full House / Small Straight / Large Straight. Off by default so a first-Yahtzee
  // placement scores by the normal rules.
  opts: { joker?: boolean } = {}
): number {
  const counts = countFaces(dice)
  const total = dice.reduce((sum, n) => sum + n, 0)

  if (opts.joker) {
    if (category === 'full_house') return 25
    if (category === 'small_straight') return 30
    if (category === 'large_straight') return 40
  }

  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face =
        category === 'ones'
          ? 1
          : category === 'twos'
            ? 2
            : category === 'threes'
              ? 3
              : category === 'fours'
                ? 4
                : category === 'fives'
                  ? 5
                  : 6
      return counts[face] * face
    }
    case 'three_kind': {
      const hasThree = Object.values(counts).some((c) => c >= 3)
      return hasThree ? total : 0
    }
    case 'four_kind': {
      const hasFour = Object.values(counts).some((c) => c >= 4)
      return hasFour ? total : 0
    }
    case 'full_house': {
      const values = Object.values(counts)
      const hasPair = values.some((c) => c === 2)
      const hasThree = values.some((c) => c === 3)
      // MVP rules: Yahtzee does NOT count as full house.
      const hasYahtzee = values.some((c) => c === 5)
      return hasPair && hasThree && !hasYahtzee ? 25 : 0
    }
    case 'small_straight': {
      // Standard runs: 1-2-3-4 or 2-3-4-5 or 3-4-5-6.
      return isConsecutiveRun(dice, [1, 2, 3, 4]) ||
        isConsecutiveRun(dice, [2, 3, 4, 5]) ||
        isConsecutiveRun(dice, [3, 4, 5, 6])
        ? 30
        : 0
    }
    case 'large_straight': {
      return isConsecutiveRun(dice, [1, 2, 3, 4, 5]) || isConsecutiveRun(dice, [2, 3, 4, 5, 6]) ? 40 : 0
    }
    case 'yahtzee': {
      return Object.values(counts).some((c) => c === 5) ? 50 : 0
    }
    case 'chance':
      return total
  }
}

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

export function hasAnyUnusedCategory(points: YahtzeeCategoryPoints): boolean {
  return YAHTZEE_ALL_CATEGORIES.some((c) => points[c] == null)
}

/** Five of a kind. */
export function isYahtzeeDice(dice: number[]): boolean {
  return Object.values(countFaces(dice)).some((c) => c === 5)
}

/**
 * The upper-section box a Yahtzee roll is FORCED into under the Joker rule (five 4s → Fours).
 * Null when the dice aren't a Yahtzee.
 */
export function matchingUpperCategory(dice: number[]): YahtzeeCategory | null {
  if (!isYahtzeeDice(dice)) return null
  const face = dice[0]
  return YAHTZEE_UPPER_CATEGORIES[face - 1] ?? null
}

/**
 * The Joker rule is in force for this roll: a Yahtzee rolled when the Yahtzee box is already
 * filled — whether with 50 or with a zero taken earlier. Standard Hasbro rules, printed on the
 * scorecard. It governs BOTH where the roll may go (see `matchingUpperCategory`) and how it
 * scores in the lower section (a Joker fills Full House / Small / Large Straight at their max
 * regardless of the pips).
 */
export function jokerApplies(dice: number[], points: YahtzeeCategoryPoints): boolean {
  return isYahtzeeDice(dice) && points.yahtzee != null
}

/**
 * A 100-point Yahtzee Bonus is earned: a Yahtzee rolled when the Yahtzee box already holds 50.
 * A box filled with a ZERO earns no bonus (but the Joker placement rules still apply).
 */
export function yahtzeeBonusEligible(dice: number[], points: YahtzeeCategoryPoints): boolean {
  return isYahtzeeDice(dice) && points.yahtzee === 50
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: YahtzeeSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

/** Returns an ISO deadline string `secondsFromNow` seconds in the future, or null if timer is disabled (0). */
export function yahtzeeTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

/** Seconds remaining until a deadline (0 if no deadline or already expired). */
export function yahtzeeSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}
