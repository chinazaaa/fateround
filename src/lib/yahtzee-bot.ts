/**
 * Yahtzee bot — hold decisions between rolls, and category choice at score time.
 *
 * Two decision surfaces:
 *
 * 1. `pickYahtzeeBotHold(dice, rollsRemaining, card)` — called after each roll
 *    (except the third). Returns EITHER a `hold` boolean array to keep for the
 *    next roll, OR `{ score: true }` if the bot would rather score now.
 *
 * 2. `pickYahtzeeBotCategory(dice, card)` — called at score time. Returns the
 *    category to commit to. Trades off score-now vs sacrifice-least-valuable
 *    for hands that don't pay well in any category.
 *
 * Deliberately NOT expectimax. The plan calls for "credible filler, not
 * annoyingly smart" — a handful of shape-based rules give a bot that plays
 * plausibly and occasionally makes a strong move (score a natural Yahtzee,
 * hold a large-straight-in-progress), while leaving room for humans to win.
 *
 * A stronger bot would enumerate all 2^5 hold sets, roll them expectedly,
 * and pick the argmax — but that adds maybe 20 points/game against a decent
 * human and 500 lines of code. Skipped by design.
 */

import type { YahtzeeCategory, YahtzeeCategoryPoints } from '@/types'
import {
  YAHTZEE_ALL_CATEGORIES,
  YAHTZEE_DICE_COUNT,
  categoryScore,
  countFaces,
  isYahtzeeDice,
  jokerApplies,
} from '@/lib/yahtzee'

export type YahtzeeBotHoldAction = { kind: 'hold'; hold: boolean[] } | { kind: 'score' }

// ── Small dice inspectors ────────────────────────────────────────────────────

function faceCountsSorted(dice: number[]): { face: number; count: number }[] {
  const counts = countFaces(dice)
  return Object.entries(counts)
    .map(([face, count]) => ({ face: Number(face), count }))
    .sort((a, b) => b.count - a.count || b.face - a.face)
}

/** True if dice contains a straight run of at least 4 consecutive faces. */
function hasFourStraight(dice: number[]): { faces: number[] } | null {
  const uniq = Array.from(new Set(dice)).sort((a, b) => a - b)
  for (const start of [1, 2, 3]) {
    const target = [start, start + 1, start + 2, start + 3]
    if (target.every((n) => uniq.includes(n))) return { faces: target }
  }
  return null
}

function hasLargeStraight(dice: number[]): boolean {
  const uniq = Array.from(new Set(dice)).sort((a, b) => a - b)
  return [1, 2, 3, 4, 5].every((n) => uniq.includes(n)) || [2, 3, 4, 5, 6].every((n) => uniq.includes(n))
}

function holdByPredicate(dice: number[], predicate: (die: number, i: number) => boolean): boolean[] {
  return dice.map(predicate)
}

// ── Hold decisions ──────────────────────────────────────────────────────────

/**
 * Called after roll 1 or roll 2 (not roll 3, which is forced-score).
 *
 * Strategy, top-to-bottom:
 *   1. Natural Yahtzee → score immediately (bot has a big score / bonus).
 *   2. Large Straight → score immediately IF the box is empty.
 *   3. Full house on the board with full_house empty → score immediately.
 *   4. Small straight in hand (unfilled + no better use) → score IF only one
 *      roll would remain; otherwise hold the 4 straight dice, chase large.
 *   5. 4+ of a kind → hold the matches, chase Yahtzee / four_kind.
 *   6. 3 of a kind → hold matches.
 *   7. 4 in a row for a straight → hold the run.
 *   8. Pair of high face (5s or 6s) → hold; chase upper section or 3-of-a-kind.
 *   9. Otherwise → reroll everything.
 */
export function pickYahtzeeBotHold(
  dice: number[],
  rollsRemaining: number,
  card: YahtzeeCategoryPoints
): YahtzeeBotHoldAction {
  if (dice.length !== YAHTZEE_DICE_COUNT) return { kind: 'hold', hold: dice.map(() => false) }
  const counts = faceCountsSorted(dice)
  const top = counts[0]

  // 1. Natural Yahtzee — always score (either 50 into yahtzee, or a bonus + a
  // strong lower/upper score elsewhere).
  if (isYahtzeeDice(dice)) return { kind: 'score' }

  // 2. Large Straight, and the box is empty.
  if (hasLargeStraight(dice) && card.large_straight == null) return { kind: 'score' }

  // 3. Full house present with the full_house box empty.
  const isFullHouse = counts.length >= 2 && counts[0]!.count === 3 && counts[1]!.count === 2 && card.full_house == null
  if (isFullHouse) return { kind: 'score' }

  // 4. 4 of a kind — hold the matches, chase Yahtzee.
  if (top && top.count >= 4) {
    return { kind: 'hold', hold: holdByPredicate(dice, (d) => d === top.face) }
  }

  // 5. 3 of a kind — hold the trip; chase four_kind / full_house / yahtzee.
  if (top && top.count === 3) {
    return { kind: 'hold', hold: holdByPredicate(dice, (d) => d === top.face) }
  }

  // 6. 4-in-a-row straight → hold the run, chase large straight.
  const four = hasFourStraight(dice)
  if (four && (card.small_straight == null || card.large_straight == null)) {
    const holdFaces = new Set(four.faces)
    return { kind: 'hold', hold: holdByPredicate(dice, (d) => holdFaces.has(d)) }
  }

  // 7. Pair of high face (5 or 6) → hold; helpful for upper section.
  if (top && top.count === 2 && (top.face === 5 || top.face === 6)) {
    return { kind: 'hold', hold: holdByPredicate(dice, (d) => d === top.face) }
  }

  // 8. Any pair (fresh roll 1 with rollsRemaining >= 1) — hold to chase 3-of-a-kind.
  if (top && top.count === 2 && rollsRemaining >= 1) {
    return { kind: 'hold', hold: holdByPredicate(dice, (d) => d === top.face) }
  }

  // 9. Nothing — reroll everything.
  return { kind: 'hold', hold: dice.map(() => false) }
}

// ── Category selection ──────────────────────────────────────────────────────

/**
 * Sacrifice order for the "score 0 somewhere" case — highest-value slots
 * lost first would be dumb; we burn low-opportunity slots first.
 *
 * yahtzee is at the END even though it has the biggest ceiling because a
 * 0-yahtzee also forfeits any future bonus Yahtzees on this card. That's
 * strictly worse than sacrificing a small upper section.
 */
const SACRIFICE_ORDER: YahtzeeCategory[] = [
  'ones',
  'twos',
  'threes',
  'four_kind',
  'three_kind',
  'chance',
  'fours',
  'fives',
  'sixes',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
]

/**
 * Pick the best category to score into given current dice and remaining
 * (unfilled) categories.
 *
 * Algorithm:
 *   - Compute scoreable value per unfilled category (Joker rule applied
 *     where it lifts a lower-combo slot to its ceiling).
 *   - If ANY category yields a positive score, pick the highest — with a
 *     tiebreak toward "wasted upper section is worst" so a 6 in `sixes`
 *     beats the same 6 in `chance`.
 *   - If EVERY category yields 0, sacrifice using `SACRIFICE_ORDER`.
 */
export function pickYahtzeeBotCategory(dice: number[], card: YahtzeeCategoryPoints): YahtzeeCategory {
  const useJoker = jokerApplies(dice, card)
  const options = YAHTZEE_ALL_CATEGORIES.filter((c) => card[c] == null).map((category) => ({
    category,
    // Joker never applies to the Yahtzee box itself.
    score: categoryScore(dice, category, { joker: useJoker && category !== 'yahtzee' }),
  }))

  if (options.length === 0) {
    // Shouldn't happen — the state machine gates on `hasAnyUnusedCategory`.
    return 'chance'
  }

  const scoring = options.filter((o) => o.score > 0)
  if (scoring.length > 0) {
    scoring.sort((a, b) => b.score - a.score || sacrificeRank(a.category) - sacrificeRank(b.category))
    return scoring[0]!.category
  }

  // Everything is 0 — sacrifice the least-valuable open slot.
  const openSet = new Set(options.map((o) => o.category))
  for (const c of SACRIFICE_ORDER) if (openSet.has(c)) return c
  return options[0]!.category
}

function sacrificeRank(c: YahtzeeCategory): number {
  const i = SACRIFICE_ORDER.indexOf(c)
  return i < 0 ? SACRIFICE_ORDER.length : i
}
