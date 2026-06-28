import { describe, it, expect } from 'vitest'
import { secondsUntil, formatCountdown, formatMinutesSeconds } from './timer-format'

describe('secondsUntil', () => {
  it('returns 0 for null / undefined / empty', () => {
    expect(secondsUntil(null)).toBe(0)
    expect(secondsUntil(undefined)).toBe(0)
    expect(secondsUntil('')).toBe(0)
  })
  it('returns 0 for a deadline in the past', () => {
    expect(secondsUntil(new Date(Date.now() - 60_000).toISOString())).toBe(0)
  })
  it('returns 0 (not NaN) for a malformed timestamp', () => {
    expect(secondsUntil('not-a-date')).toBe(0)
  })
  it('ceils the remaining whole seconds', () => {
    const r = secondsUntil(new Date(Date.now() + 5_500).toISOString())
    expect(r).toBeGreaterThanOrEqual(5)
    expect(r).toBeLessThanOrEqual(6)
  })
})

describe('formatCountdown (hours-aware)', () => {
  it('shows m:ss under an hour', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(599)).toBe('9:59')
  })
  it('shows h:mm:ss at or over an hour', () => {
    expect(formatCountdown(3600)).toBe('1:00:00')
    expect(formatCountdown(3661)).toBe('1:01:01')
  })
})

describe('formatMinutesSeconds (minutes-only)', () => {
  it('shows m:ss and lets minutes exceed 59', () => {
    expect(formatMinutesSeconds(5)).toBe('0:05')
    expect(formatMinutesSeconds(65)).toBe('1:05')
    expect(formatMinutesSeconds(3600)).toBe('60:00')
  })
})
