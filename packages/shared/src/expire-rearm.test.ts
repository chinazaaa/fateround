import { describe, it, expect } from 'vitest'
import { nextExpireRearm, isSkippedExpire } from './expire-rearm'

const cfg = { cooldownMs: 3000, graceSkips: 3, maxBackoffMs: 60000 }

describe('nextExpireRearm', () => {
  it('a normal 2xx keeps the flat cooldown and clears the streak', () => {
    expect(nextExpireRearm({ streak: 5, ok: true, skipped: false, ...cfg })).toEqual({ streak: 0, rearmMs: 3000 })
  })
  it('keeps the flat cadence through the grace skips, then backs off to the cap', () => {
    let streak = 0
    const delays: number[] = []
    for (let i = 0; i < 12; i++) {
      const r = nextExpireRearm({ streak, ok: true, skipped: true, ...cfg })
      streak = r.streak
      delays.push(r.rearmMs)
    }
    expect(delays.slice(0, 3)).toEqual([3000, 3000, 3000])
    expect(delays[3]).toBe(6000)
    expect(delays[4]).toBe(12000)
    expect(delays[11]).toBe(60000)
  })
  it('a non-2xx has no grace', () => {
    expect(nextExpireRearm({ streak: 0, ok: false, skipped: false, ...cfg })).toEqual({ streak: 1, rearmMs: 6000 })
  })
})

describe('isSkippedExpire', () => {
  it('only a payload with skipped === true counts', () => {
    expect(isSkippedExpire({ ok: true, skipped: true })).toBe(true)
    expect(isSkippedExpire({ ok: true, skipped: false })).toBe(false)
    expect(isSkippedExpire(undefined)).toBe(false)
    expect(isSkippedExpire(null)).toBe(false)
    expect(isSkippedExpire('skipped')).toBe(false)
  })
})
