import { describe, it, expect } from 'vitest'
import type { Player } from '@/types'
import { DRIVER_QUORUM, isAdvanceDriver } from '@/lib/advance-driver'

function player(id: string, joined_at: string, extra: Partial<Player> = {}): Player {
  return { id, game_id: 'G', name: id, joined_at, ...(extra as object) } as Player
}

describe('isAdvanceDriver', () => {
  const p = [
    player('c', '2026-07-14T00:00:03Z'),
    player('a', '2026-07-14T00:00:01Z'),
    player('b', '2026-07-14T00:00:02Z'),
    player('d', '2026-07-14T00:00:04Z'),
  ]

  it('elects exactly the DRIVER_QUORUM earliest-joined players regardless of array order', () => {
    expect(DRIVER_QUORUM).toBe(2)
    // earliest two by joined_at are a then b
    expect(isAdvanceDriver(p, 'a')).toBe(true)
    expect(isAdvanceDriver(p, 'b')).toBe(true)
    expect(isAdvanceDriver(p, 'c')).toBe(false)
    expect(isAdvanceDriver(p, 'd')).toBe(false)
  })

  it('is order-independent — a differently sorted array elects the same quorum', () => {
    const reversed = [...p].reverse()
    expect(isAdvanceDriver(reversed, 'a')).toBe(true)
    expect(isAdvanceDriver(reversed, 'b')).toBe(true)
    expect(isAdvanceDriver(reversed, 'c')).toBe(false)
  })

  it('the host always drives', () => {
    expect(isAdvanceDriver(p, 'c', { isHost: true })).toBe(true)
    expect(isAdvanceDriver([], null, { isHost: true })).toBe(true)
  })

  it('a client with no seat is never an elected player-driver', () => {
    expect(isAdvanceDriver(p, null)).toBe(false)
    expect(isAdvanceDriver(p, undefined)).toBe(false)
  })

  it('skips spectators and eliminated players when electing', () => {
    const withSpectators = [
      player('a', '2026-07-14T00:00:01Z', { spectator: true }),
      player('b', '2026-07-14T00:00:02Z', { is_eliminated: true }),
      player('c', '2026-07-14T00:00:03Z'),
      player('d', '2026-07-14T00:00:04Z'),
    ]
    // a and b are ineligible, so c and d are the quorum
    expect(isAdvanceDriver(withSpectators, 'a')).toBe(false)
    expect(isAdvanceDriver(withSpectators, 'b')).toBe(false)
    expect(isAdvanceDriver(withSpectators, 'c')).toBe(true)
    expect(isAdvanceDriver(withSpectators, 'd')).toBe(true)
  })

  it('elects everyone eligible when the game is smaller than the quorum', () => {
    const two = [player('a', '2026-07-14T00:00:01Z')]
    expect(isAdvanceDriver(two, 'a')).toBe(true)
  })

  it('breaks joined_at ties deterministically by id', () => {
    const tied = [
      player('y', '2026-07-14T00:00:01Z'),
      player('x', '2026-07-14T00:00:01Z'),
      player('z', '2026-07-14T00:00:01Z'),
    ]
    // same joined_at → id order x, y, z → quorum is x, y
    expect(isAdvanceDriver(tied, 'x')).toBe(true)
    expect(isAdvanceDriver(tied, 'y')).toBe(true)
    expect(isAdvanceDriver(tied, 'z')).toBe(false)
  })
})
