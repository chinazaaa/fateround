import { describe, it, expect } from 'vitest'
import {
  clampScrabbleTimer,
  clampScrabbleGameDuration,
  clampScrabbleTimeExtension,
  formatScrabbleGameDuration,
  scrabbleGameSessionExpired,
  SCRABBLE_TIMER_OPTIONS,
  SCRABBLE_GAME_DURATION_OPTIONS,
  SCRABBLE_GAME_TIME_EXTENSION_OPTIONS,
} from './scrabble'

describe('clampScrabbleTimer', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_TIMER_OPTIONS) expect(clampScrabbleTimer(opt)).toBe(opt)
  })
  it('falls back to 0 for anything else', () => {
    expect(clampScrabbleTimer(45)).toBe(0)
    expect(clampScrabbleTimer('nonsense')).toBe(0)
    expect(clampScrabbleTimer(undefined)).toBe(0)
    expect(clampScrabbleTimer(null)).toBe(0)
  })
  it('coerces numeric strings', () => {
    expect(clampScrabbleTimer('60')).toBe(60)
  })
})

describe('clampScrabbleGameDuration', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_GAME_DURATION_OPTIONS) expect(clampScrabbleGameDuration(opt)).toBe(opt)
  })
  it('falls back to 0 for disallowed / missing', () => {
    expect(clampScrabbleGameDuration(999)).toBe(0)
    expect(clampScrabbleGameDuration(undefined)).toBe(0)
    expect(clampScrabbleGameDuration('abc')).toBe(0)
  })
})

describe('clampScrabbleTimeExtension', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_GAME_TIME_EXTENSION_OPTIONS) expect(clampScrabbleTimeExtension(opt)).toBe(opt)
  })
  it('falls back to 0 for disallowed / missing', () => {
    expect(clampScrabbleTimeExtension(0)).toBe(0) // 0 isn't an extension option
    expect(clampScrabbleTimeExtension(120)).toBe(0)
    expect(clampScrabbleTimeExtension(undefined)).toBe(0)
  })
})

describe('formatScrabbleGameDuration', () => {
  it('describes "no limit" for zero / negative', () => {
    expect(formatScrabbleGameDuration(0)).toBe('No limit')
    expect(formatScrabbleGameDuration(-5)).toBe('No limit')
  })
  it('formats whole hours', () => {
    expect(formatScrabbleGameDuration(3600)).toBe('1 hour')
    expect(formatScrabbleGameDuration(7200)).toBe('2 hours')
  })
  it('formats sub-hour durations in minutes', () => {
    expect(formatScrabbleGameDuration(1800)).toBe('30 minutes')
    expect(formatScrabbleGameDuration(5400)).toBe('90 minutes')
  })
})

describe('scrabbleGameSessionExpired', () => {
  it('is never expired with no limit or no start time', () => {
    expect(scrabbleGameSessionExpired(new Date().toISOString(), 0)).toBe(false)
    expect(scrabbleGameSessionExpired(new Date().toISOString(), null)).toBe(false)
    expect(scrabbleGameSessionExpired(null, 3600)).toBe(false)
  })
  it('is expired once elapsed exceeds the duration', () => {
    // started two hours ago, 30-minute limit → expired
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    expect(scrabbleGameSessionExpired(twoHoursAgo, 1800)).toBe(true)
  })
  it('is not expired while still within the duration', () => {
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString()
    expect(scrabbleGameSessionExpired(tenSecondsAgo, 3600)).toBe(false)
  })
})
