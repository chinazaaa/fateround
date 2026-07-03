import { describe, it, expect } from 'vitest'
import {
  clampSchoolClassCount,
  clampSchoolMatchSeconds,
  computeSchoolRooms,
  DEFAULT_SCHOOL_MATCH_SECONDS,
  GRADUATE_LABEL,
  hasGraduated,
  MAX_SCHOOL_CLASSES,
  SCHOOL_MAX_ROOM,
  SCHOOL_MIN_ROOM,
  schoolClassLabel,
  schoolLadder,
} from './tournament-school'

/** Room sizes for a flat field of n same-class players. */
function roomSizes(n: number): number[] {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, level: 0 }))
  return computeSchoolRooms(players).rooms.map((r) => r.length)
}

describe('clampSchoolClassCount', () => {
  it('clamps to the valid ladder range and floors non-integers', () => {
    expect(clampSchoolClassCount(0)).toBe(2)
    expect(clampSchoolClassCount(1)).toBe(2)
    expect(clampSchoolClassCount(6)).toBe(6)
    expect(clampSchoolClassCount(999)).toBe(MAX_SCHOOL_CLASSES)
    expect(clampSchoolClassCount(6.9)).toBe(6)
  })

  it('defaults to the full ladder for junk input', () => {
    expect(clampSchoolClassCount(undefined)).toBe(MAX_SCHOOL_CLASSES)
    expect(clampSchoolClassCount('nope')).toBe(MAX_SCHOOL_CLASSES)
  })
})

describe('clampSchoolMatchSeconds', () => {
  it('accepts the 2/3/4-minute options and defaults to 3 minutes otherwise', () => {
    expect(clampSchoolMatchSeconds(120)).toBe(120)
    expect(clampSchoolMatchSeconds(180)).toBe(180)
    expect(clampSchoolMatchSeconds(240)).toBe(240)
    expect(DEFAULT_SCHOOL_MATCH_SECONDS).toBe(180)
    // Anything else (including the longer regular-Whot durations) falls back to default.
    expect(clampSchoolMatchSeconds(900)).toBe(DEFAULT_SCHOOL_MATCH_SECONDS)
    expect(clampSchoolMatchSeconds(0)).toBe(DEFAULT_SCHOOL_MATCH_SECONDS)
    expect(clampSchoolMatchSeconds(undefined)).toBe(DEFAULT_SCHOOL_MATCH_SECONDS)
  })
})

describe('schoolLadder', () => {
  it('returns the requested prefix of classes', () => {
    expect(schoolLadder(6)).toEqual(['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'])
    expect(schoolLadder(MAX_SCHOOL_CLASSES)).toHaveLength(MAX_SCHOOL_CLASSES)
  })
})

describe('schoolClassLabel / hasGraduated', () => {
  it('labels a level within the ladder by its class name', () => {
    expect(schoolClassLabel(0, 6)).toBe('Primary 1')
    expect(schoolClassLabel(5, 6)).toBe('Primary 6')
  })

  it('labels a level at or past the ladder end as graduated', () => {
    expect(schoolClassLabel(6, 6)).toBe(GRADUATE_LABEL)
    expect(schoolClassLabel(99, 6)).toBe(GRADUATE_LABEL)
    expect(hasGraduated(6, 6)).toBe(true)
    expect(hasGraduated(5, 6)).toBe(false)
  })
})

describe('computeSchoolRooms', () => {
  it('matches the host-specified room sizing (min rooms, 3–5 each, balanced)', () => {
    expect(roomSizes(10)).toEqual([5, 5])
    expect(roomSizes(11)).toEqual([4, 4, 3])
    expect(roomSizes(12)).toEqual([4, 4, 4])
    expect(roomSizes(13)).toEqual([5, 4, 4])
  })

  it('keeps every room within 3–5 for all fields of 3+ (only a 2-player final is smaller)', () => {
    expect(roomSizes(2)).toEqual([2]) // unavoidable — just two players remain
    for (let n = 3; n <= 60; n++) {
      const sizes = roomSizes(n)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n) // everyone placed, nobody sits out
      for (const s of sizes) {
        expect(s).toBeGreaterThanOrEqual(SCHOOL_MIN_ROOM)
        expect(s).toBeLessThanOrEqual(SCHOOL_MAX_ROOM)
      }
      // Balanced: sizes differ by at most one.
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })

  it('groups players by class (rooms hold the same / nearest classes)', () => {
    const players = [
      { id: 'uni1', level: 3 },
      { id: 'p1', level: 0 },
      { id: 'p2', level: 0 },
      { id: 'p3', level: 0 },
      { id: 'uni2', level: 3 },
      { id: 'uni3', level: 3 },
    ]
    const { rooms } = computeSchoolRooms(players)
    expect(rooms).toHaveLength(2)
    const roomOf = (id: string) => rooms.findIndex((r) => r.includes(id))
    // The three level-0 players share a room; the three level-3 players share the other.
    expect(new Set(['p1', 'p2', 'p3'].map(roomOf)).size).toBe(1)
    expect(new Set(['uni1', 'uni2', 'uni3'].map(roomOf)).size).toBe(1)
    expect(roomOf('p1')).not.toBe(roomOf('uni1'))
  })

  it('returns no rooms for a lone (or empty) field', () => {
    expect(computeSchoolRooms([{ id: 'only', level: 2 }]).rooms).toEqual([])
    expect(computeSchoolRooms([]).rooms).toEqual([])
  })
})
