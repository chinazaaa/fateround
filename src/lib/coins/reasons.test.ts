import { describe, it, expect } from 'vitest'
import { reasonInFilter, streakMultiplier } from './reasons'
import { countUniqueHumans } from './award-service'

describe('streakMultiplier', () => {
  it('is 1.0 for a fresh account', () => {
    expect(streakMultiplier(0)).toBe(1)
  })
  it('caps at 2.0 after 30 days', () => {
    expect(streakMultiplier(30)).toBeCloseTo(2)
    expect(streakMultiplier(120)).toBeCloseTo(2)
  })
  it('ramps roughly linearly across the first 30 days', () => {
    expect(streakMultiplier(15)).toBeCloseTo(1.5)
  })
})

describe('reasonInFilter', () => {
  it("bucket 'earned' excludes spends, refunds, admin", () => {
    expect(reasonInFilter('win', 'earned')).toBe(true)
    expect(reasonInFilter('shop_purchase', 'earned')).toBe(false)
    expect(reasonInFilter('admin_adjustment', 'earned')).toBe(false)
    expect(reasonInFilter('refund', 'earned')).toBe(false)
  })
  it("bucket 'spent' matches only shop_purchase", () => {
    expect(reasonInFilter('shop_purchase', 'spent')).toBe(true)
    expect(reasonInFilter('win', 'spent')).toBe(false)
  })
})

describe('countUniqueHumans', () => {
  it('drops bots', () => {
    expect(
      countUniqueHumans([
        { id: 'a', profile_id: null, is_bot: false },
        { id: 'b', profile_id: null, is_bot: true },
      ])
    ).toBe(1)
  })
  it('dedupes by profile_id across seats', () => {
    expect(
      countUniqueHumans([
        { id: 'a', profile_id: 'P1', is_bot: false },
        { id: 'b', profile_id: 'P1', is_bot: false },
        { id: 'c', profile_id: 'P2', is_bot: false },
      ])
    ).toBe(2)
  })
  it('falls back to seat id when no profile is attached', () => {
    expect(
      countUniqueHumans([
        { id: 'a', profile_id: null, is_bot: false },
        { id: 'b', profile_id: null, is_bot: false },
      ])
    ).toBe(2)
  })
})
