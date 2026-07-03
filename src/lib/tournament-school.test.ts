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
  schoolAdvancers,
  type SchoolHand,
} from './tournament-school'

/** Compact SchoolHand factory: cardCount drives the ranking; handSum defaults to it. */
function hand(tpId: string, cardCount: number): SchoolHand {
  return { tpId, cardCount, handSum: cardCount }
}

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

  it('matches players by class — a class with only 2 gets its own room of 2, nobody out', () => {
    const players = [
      { id: 'p1', level: 0 },
      { id: 'p2', level: 0 },
      { id: 'p3', level: 0 },
      { id: 'ss2a', level: 9 },
      { id: 'ss2b', level: 9 },
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual([])
    expect(rooms).toHaveLength(2)
    const roomOf = (id: string) => rooms.findIndex((r) => r.includes(id))
    // The two SS2 players play each other; they are not absorbed into the P1 room.
    expect(roomOf('ss2a')).toBe(roomOf('ss2b'))
    expect(roomOf('ss2a')).not.toBe(roomOf('p1'))
    expect(rooms.find((r) => r.includes('ss2a'))).toHaveLength(2)
    expect(new Set(['p1', 'p2', 'p3'].map(roomOf)).size).toBe(1)
  })

  it('eliminates the sole straggler with no one left to play (Michelle case)', () => {
    const players = [
      { id: 'bola', level: 1 }, // Primary 2 — a full room of their own
      { id: 'klaus', level: 1 },
      { id: 'naza', level: 1 },
      { id: 'michelle', level: 0 }, // alone in Primary 1, and no other straggler to pair with
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual(['michelle'])
    expect(rooms).toHaveLength(1)
    expect([...rooms[0]].sort()).toEqual(['bola', 'klaus', 'naza'])
  })

  it('pairs a straggler with another room’s straggler instead of eliminating them', () => {
    const players = [
      { id: 'bola', level: 2 }, // a room at level 2
      { id: 'klaus', level: 2 },
      { id: 'naza', level: 2 },
      { id: 'michelle', level: 0 }, // alone in her class...
      { id: 'ada', level: 1 }, // ...but another player is stranded alone too
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual([]) // both stragglers have an opponent now
    // Michelle and Ada play each other; Bola/Klaus/Naza keep their own room.
    const michelleRoom = rooms.find((r) => r.includes('michelle'))
    expect(michelleRoom).toBeDefined()
    expect([...(michelleRoom ?? [])].sort()).toEqual(['ada', 'michelle'])
  })

  it('does NOT eliminate a lone frontrunner in the top class — they wait', () => {
    const players = [
      { id: 'p1', level: 0 },
      { id: 'p2', level: 0 },
      { id: 'p3', level: 0 },
      { id: 'leader', level: 9 }, // alone, but at the top — the frontrunner
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual([]) // the leader is not knocked out
    expect(rooms).toEqual([['p1', 'p2', 'p3']]) // leader waits, isn't forced into a room
    expect(rooms.flat()).not.toContain('leader')
  })

  it('pairs the two lowest adjacent stragglers; the frontrunner waits (nobody out)', () => {
    const players = [
      { id: 'a', level: 0 },
      { id: 'b', level: 1 },
      { id: 'c', level: 2 }, // frontrunner — waits rather than joining a lopsided room
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual([])
    expect(rooms).toEqual([['a', 'b']]) // a(0) & b(1) are within one class
    expect(rooms.flat()).not.toContain('c') // c waits for the field to reach level 2
  })

  it('eliminates a straggler stranded more than one class below the pack', () => {
    // The reported case: SS1 / SS3 / Uni100 / Uni200 (levels 9, 11, 12, 13).
    const players = [
      { id: 'winnie', level: 9 }, // SS1 — 2 classes below the next, out of contention
      { id: 'demi', level: 11 }, // SS3
      { id: 'leviathan', level: 12 }, // Uni 100
      { id: 'mojito', level: 13 }, // Uni 200 — frontrunner, waits
    ]
    const { rooms, eliminated } = computeSchoolRooms(players)
    expect(eliminated).toEqual(['winnie'])
    expect(rooms).toEqual([['demi', 'leviathan']]) // SS3 & Uni100 are one class apart
    expect(rooms.flat()).not.toContain('mojito') // Uni200 waits, never cut
  })

  it('crowns the leader when the last two players are more than a class apart', () => {
    // No fair match possible → the lower is out, leaving a single survivor to win.
    const { rooms, eliminated } = computeSchoolRooms([
      { id: 'low', level: 5 },
      { id: 'high', level: 9 },
    ])
    expect(rooms).toEqual([])
    expect(eliminated).toEqual(['low'])
  })

  it('returns no rooms and no eliminations for a lone (or empty) field', () => {
    expect(computeSchoolRooms([{ id: 'only', level: 2 }])).toEqual({ rooms: [], eliminated: [] })
    expect(computeSchoolRooms([])).toEqual({ rooms: [], eliminated: [] })
  })
})

describe('schoolAdvancers', () => {
  it('advances everyone except the most-cards player when a full room finishes', () => {
    // winner a (0 cards), b (3), c (5) — c holds the most and repeats.
    const played = [hand('a', 0), hand('b', 3), hand('c', 5)]
    expect(schoolAdvancers(played, 'a').sort()).toEqual(['a', 'b'])
  })

  it('advances the lone survivor when everyone else left the room', () => {
    // The regression: a winner whose opponents dropped out was the only hand left,
    // so the old logic picked them as the repeater and nobody climbed.
    expect(schoolAdvancers([hand('a', 0)], 'a')).toEqual(['a'])
  })

  it('never turns the winner into the repeater', () => {
    // Even if the winner somehow holds the most cards, they still advance and the
    // other player is the one made to repeat.
    const played = [hand('winner', 9), hand('other', 2)]
    expect(schoolAdvancers(played, 'winner')).toEqual(['winner'])
  })

  it('falls back to most-cards repeats when the winner is unknown', () => {
    const played = [hand('a', 1), hand('b', 4)]
    expect(schoolAdvancers(played, null)).toEqual(['a'])
  })
})
