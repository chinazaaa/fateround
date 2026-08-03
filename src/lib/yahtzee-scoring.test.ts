import { describe, expect, it } from 'vitest'
import {
  categoryScore,
  isYahtzeeDice,
  jokerApplies,
  matchingUpperCategory,
  totalScore,
  yahtzeeBonusEligible,
} from './yahtzee'
import type { YahtzeeCategoryPoints } from '@/types'

/**
 * Standard Hasbro scoring: the Yahtzee Bonus and the Joker rule. Both are real rules printed on
 * the scorecard, not house rules — and both only ever ADD points the rules grant, so the risk is
 * entirely in getting the conditions right. That is what these pin down.
 */

const empty = (): YahtzeeCategoryPoints => ({
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
})

describe('the Joker rule', () => {
  it('does NOT apply while the Yahtzee box is still open', () => {
    // A first five-of-a-kind is not a Joker — it should be taken in the Yahtzee box, and if the
    // player insists on Full House it scores 0, exactly as before this rule existed.
    const cats = empty()
    expect(jokerApplies([4, 4, 4, 4, 4], cats)).toBe(false)
    expect(categoryScore([4, 4, 4, 4, 4], 'full_house', { joker: false })).toBe(0)
  })

  it('applies once the box is filled — with 50 OR with a taken zero', () => {
    expect(jokerApplies([4, 4, 4, 4, 4], { ...empty(), yahtzee: 50 })).toBe(true)
    // A zero in the box still forces the Joker placement rules; it just earns no bonus.
    expect(jokerApplies([4, 4, 4, 4, 4], { ...empty(), yahtzee: 0 })).toBe(true)
  })

  it('fills a lower box at its maximum regardless of the pips', () => {
    // Five 4s are not a straight, but as a Joker they fill Large Straight for 40.
    expect(categoryScore([4, 4, 4, 4, 4], 'large_straight', { joker: true })).toBe(40)
    expect(categoryScore([4, 4, 4, 4, 4], 'small_straight', { joker: true })).toBe(30)
    expect(categoryScore([4, 4, 4, 4, 4], 'full_house', { joker: true })).toBe(25)
  })

  it('scores the upper and one-of-a-kind boxes normally under the Joker', () => {
    // The Joker only overrides the three combination boxes; Fours still scores the pips.
    expect(categoryScore([4, 4, 4, 4, 4], 'fours', { joker: true })).toBe(20)
    expect(categoryScore([4, 4, 4, 4, 4], 'chance', { joker: true })).toBe(20)
    expect(categoryScore([4, 4, 4, 4, 4], 'four_kind', { joker: true })).toBe(20)
  })

  it('points the forced upper box at the matching face', () => {
    expect(matchingUpperCategory([4, 4, 4, 4, 4])).toBe('fours')
    expect(matchingUpperCategory([6, 6, 6, 6, 6])).toBe('sixes')
    expect(matchingUpperCategory([1, 2, 3, 4, 5])).toBeNull()
  })
})

describe('the Yahtzee Bonus', () => {
  it('is earned only with the box already at 50', () => {
    expect(yahtzeeBonusEligible([2, 2, 2, 2, 2], { ...empty(), yahtzee: 50 })).toBe(true)
    // Box holds a taken zero — Joker applies but no bonus.
    expect(yahtzeeBonusEligible([2, 2, 2, 2, 2], { ...empty(), yahtzee: 0 })).toBe(false)
    // Box still open — this Yahtzee should go in the box, not earn a bonus.
    expect(yahtzeeBonusEligible([2, 2, 2, 2, 2], empty())).toBe(false)
    // Not five of a kind.
    expect(yahtzeeBonusEligible([2, 2, 2, 3, 3], { ...empty(), yahtzee: 50 })).toBe(false)
  })

  it('adds a flat 100 per bonus to the total', () => {
    const cats: YahtzeeCategoryPoints = { ...empty(), yahtzee: 50, chance: 20 }
    expect(totalScore(cats, 0)).toBe(70)
    expect(totalScore(cats, 1)).toBe(170)
    expect(totalScore(cats, 3)).toBe(370)
    // A negative or missing count never subtracts.
    expect(totalScore(cats, -2)).toBe(70)
  })
})

describe('isYahtzeeDice', () => {
  it('is five of a kind and nothing less', () => {
    expect(isYahtzeeDice([5, 5, 5, 5, 5])).toBe(true)
    expect(isYahtzeeDice([5, 5, 5, 5, 4])).toBe(false)
  })
})
