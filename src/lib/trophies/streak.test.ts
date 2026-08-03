import { describe, it, expect } from 'vitest'
import { advanceStreak, daysBetween, watDate, type StreakState } from './streak'

const state = (over: Partial<StreakState> = {}): StreakState => ({
  current_streak: 3,
  longest_streak: 5,
  last_active_date: '2026-08-01',
  ...over,
})

describe('watDate', () => {
  it('uses the WAT calendar, not UTC', () => {
    // 23:30 UTC is already the next day in Lagos. Getting this wrong shifts every streak
    // boundary by an hour and breaks "played today" for late-night players — which is exactly
    // when a party game gets used.
    expect(watDate(new Date('2026-08-01T23:30:00Z'))).toBe('2026-08-02')
    expect(watDate(new Date('2026-08-01T22:30:00Z'))).toBe('2026-08-01')
  })

  it('returns a plain YYYY-MM-DD, matching profiles.last_active_date', () => {
    expect(watDate(new Date('2026-08-01T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('daysBetween', () => {
  it('counts whole days across a month boundary', () => {
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1)
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
    expect(daysBetween('2026-08-01', '2026-07-31')).toBe(-1)
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
  })

  it('is NaN for junk rather than guessing', () => {
    expect(Number.isNaN(daysBetween('not-a-date', '2026-08-01'))).toBe(true)
  })
})

describe('advanceStreak', () => {
  it('starts a streak for a player with no history', () => {
    expect(
      advanceStreak(state({ current_streak: 0, longest_streak: 0, last_active_date: null }), '2026-08-02')
    ).toEqual({ current_streak: 1, longest_streak: 1, last_active_date: '2026-08-02' })
  })

  it('extends on a consecutive day', () => {
    expect(advanceStreak(state(), '2026-08-02')).toEqual({
      current_streak: 4,
      longest_streak: 5,
      last_active_date: '2026-08-02',
    })
  })

  it('raises the longest when the current passes it', () => {
    expect(advanceStreak(state({ current_streak: 5, longest_streak: 5 }), '2026-08-02')).toEqual({
      current_streak: 6,
      longest_streak: 6,
      last_active_date: '2026-08-02',
    })
  })

  it('does nothing when today is already counted', () => {
    // A player finishes several games a day. Without this the streak would count games, not
    // days — so the idempotence lives here rather than in each caller.
    const before = state()
    expect(advanceStreak(before, '2026-08-01')).toEqual(before)
  })

  it('resets to day one after a gap', () => {
    expect(advanceStreak(state(), '2026-08-05')).toEqual({
      current_streak: 1,
      longest_streak: 5, // the record survives the reset
      last_active_date: '2026-08-05',
    })
  })

  it('treats a two-day gap as broken, not extended', () => {
    // The classic off-by-one: "yesterday" is a gap of exactly 1, never 2.
    expect(advanceStreak(state(), '2026-08-03').current_streak).toBe(1)
  })

  it('does not punish a player for a future stored date', () => {
    // Clock skew or a bad backfill. Resetting their streak because OUR data is wrong is the
    // worse failure, so a date ahead of today counts as already-recorded.
    const before = state({ last_active_date: '2026-09-01' })
    expect(advanceStreak(before, '2026-08-02')).toEqual(before)
  })

  it('starts clean on an unparseable stored date rather than propagating it', () => {
    expect(advanceStreak(state({ last_active_date: 'garbage' }), '2026-08-02')).toEqual({
      current_streak: 1,
      longest_streak: 5,
      last_active_date: '2026-08-02',
    })
  })

  it('treats negative stored counters as zero', () => {
    expect(advanceStreak(state({ current_streak: -4, longest_streak: -1 }), '2026-08-02')).toEqual({
      current_streak: 1,
      longest_streak: 1,
      last_active_date: '2026-08-02',
    })
  })
})
