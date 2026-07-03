import { describe, it, expect } from 'vitest'
import {
  clampSchoolClassCount,
  computeSchoolPairings,
  GRADUATE_LABEL,
  hasGraduated,
  MAX_SCHOOL_CLASSES,
  schoolClassLabel,
  schoolLadder,
} from './tournament-school'

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

describe('computeSchoolPairings', () => {
  it('pairs an even field entirely, with nobody sitting out', () => {
    const { matches, sitOut } = computeSchoolPairings([
      { id: 'a', level: 0 },
      { id: 'b', level: 0 },
      { id: 'c', level: 1 },
      { id: 'd', level: 1 },
    ])
    expect(matches).toHaveLength(2)
    expect(sitOut).toHaveLength(0)
  })

  it('pairs players by class (adjacent after sorting by level)', () => {
    const { matches } = computeSchoolPairings([
      { id: 'high', level: 3 },
      { id: 'low1', level: 0 },
      { id: 'low2', level: 0 },
      { id: 'mid', level: 3 },
    ])
    // low1/low2 are the two level-0 players; high/mid are the two level-3 players.
    const pairKeys = matches.map((m) => [...m].sort().join('-'))
    expect(pairKeys).toContain('low1-low2')
    expect(pairKeys).toContain('high-mid')
  })

  it('sits exactly one player out on an odd field', () => {
    const { matches, sitOut } = computeSchoolPairings([
      { id: 'a', level: 0 },
      { id: 'b', level: 0 },
      { id: 'c', level: 0 },
    ])
    expect(matches).toHaveLength(1)
    expect(sitOut).toHaveLength(1)
    // Everyone appears exactly once across matches + sit-out.
    const seen = [...matches.flat(), ...sitOut].sort()
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('prefers to sit out someone who did not sit out last round', () => {
    const players = [
      { id: 'a', level: 0 },
      { id: 'b', level: 0 },
      { id: 'c', level: 0 },
    ]
    // 'c' would be the default sit-out (last in sorted order); avoiding it should
    // bench someone else instead.
    const { sitOut } = computeSchoolPairings(players, ['c'])
    expect(sitOut).toHaveLength(1)
    expect(sitOut[0]).not.toBe('c')
  })

  it('treats a lone player as a sit-out with no match', () => {
    const { matches, sitOut } = computeSchoolPairings([{ id: 'only', level: 2 }])
    expect(matches).toHaveLength(0)
    expect(sitOut).toEqual(['only'])
  })
})
