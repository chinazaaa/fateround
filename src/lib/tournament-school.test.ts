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
  schoolClassLabel,
  schoolLadder,
} from './tournament-school'

/** Room sizes (sorted) for a field of n players all in the same class. */
function sameClassRoomSizes(n: number): number[] {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, level: 0 }))
  return computeSchoolRooms(players)
    .rooms.map((r) => r.length)
    .sort((a, b) => b - a)
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
  it('splits a single class into balanced rooms of at most 5 (no minimum)', () => {
    expect(sameClassRoomSizes(2)).toEqual([2]) // two in a class just play each other
    expect(sameClassRoomSizes(3)).toEqual([3])
    expect(sameClassRoomSizes(5)).toEqual([5])
    expect(sameClassRoomSizes(6)).toEqual([3, 3])
    expect(sameClassRoomSizes(9)).toEqual([5, 4])
    expect(sameClassRoomSizes(11)).toEqual([4, 4, 3])
  })

  it('never exceeds 5 and places everyone, for any single-class size 2–60', () => {
    for (let n = 2; n <= 60; n++) {
      const sizes = sameClassRoomSizes(n)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n)
      for (const s of sizes) expect(s).toBeLessThanOrEqual(SCHOOL_MAX_ROOM)
    }
  })

  it('matches players by class — a class with only 2 gets its own room of 2', () => {
    const players = [
      { id: 'p1', level: 0 },
      { id: 'p2', level: 0 },
      { id: 'p3', level: 0 },
      { id: 'ss2a', level: 9 },
      { id: 'ss2b', level: 9 },
    ]
    const { rooms } = computeSchoolRooms(players)
    expect(rooms).toHaveLength(2)
    const roomOf = (id: string) => rooms.findIndex((r) => r.includes(id))
    // The two SS2 players play each other; they are not absorbed into the P1 room.
    expect(roomOf('ss2a')).toBe(roomOf('ss2b'))
    expect(roomOf('ss2a')).not.toBe(roomOf('p1'))
    expect(rooms.find((r) => r.includes('ss2a'))).toHaveLength(2)
    expect(new Set(['p1', 'p2', 'p3'].map(roomOf)).size).toBe(1)
  })

  it('merges a single lone player into the nearest class room (no sit-out, no deadlock)', () => {
    const players = [
      { id: 'p1', level: 0 },
      { id: 'p2', level: 0 },
      { id: 'p3', level: 0 },
      { id: 'lonely', level: 9 },
    ]
    const { rooms } = computeSchoolRooms(players)
    // The lone SS2 player can't play alone, so they join the only room.
    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toHaveLength(4)
    expect(rooms[0]).toContain('lonely')
  })

  it('groups multiple stranded lone players together (nearest classes)', () => {
    const players = [
      { id: 'a', level: 0 },
      { id: 'b', level: 1 },
      { id: 'c', level: 2 },
    ]
    // Nobody has a same-class partner, so all three play one room.
    const { rooms } = computeSchoolRooms(players)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns no rooms for a lone (or empty) field', () => {
    expect(computeSchoolRooms([{ id: 'only', level: 2 }]).rooms).toEqual([])
    expect(computeSchoolRooms([]).rooms).toEqual([])
  })
})
