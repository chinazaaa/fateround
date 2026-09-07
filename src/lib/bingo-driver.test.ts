import { describe, it, expect } from 'vitest'
import type { Player } from '@/types'
import {
  BINGO_HOST_GRACE_MS,
  BINGO_PLAYER_GRACE_MS,
  bingoAutoCallPollIntervalMs,
  bingoDriverRole,
  newestCalledAtOf,
  shouldRequestBingoCall,
} from '@/lib/bingo-driver'

function player(id: string, joined_at: string, extra: Partial<Player> = {}): Player {
  return { id, game_id: 'G', name: id, joined_at, ...(extra as object) } as Player
}

const roster = [
  player('c', '2026-08-30T00:00:03Z'),
  player('a', '2026-08-30T00:00:01Z'),
  player('b', '2026-08-30T00:00:02Z'),
]

describe('bingoDriverRole', () => {
  it('elects EXACTLY ONE player driver, regardless of local array order', () => {
    const roles = roster.map((p) => bingoDriverRole({ players: roster, myPlayerId: p.id }))
    expect(roles.filter((r) => r === 'player')).toHaveLength(1)
    // earliest joined_at wins
    expect(bingoDriverRole({ players: roster, myPlayerId: 'a' })).toBe('player')
    expect(bingoDriverRole({ players: roster, myPlayerId: 'b' })).toBe('none')
    expect(bingoDriverRole({ players: roster, myPlayerId: 'c' })).toBe('none')

    // A different local sort order must elect the same player.
    const shuffled = [...roster].reverse()
    expect(bingoDriverRole({ players: shuffled, myPlayerId: 'a' })).toBe('player')
    expect(bingoDriverRole({ players: shuffled, myPlayerId: 'b' })).toBe('none')
  })

  it('ties on joined_at break deterministically by id', () => {
    const tied = [player('z', 'T'), player('y', 'T')]
    expect(bingoDriverRole({ players: tied, myPlayerId: 'y' })).toBe('player')
    expect(bingoDriverRole({ players: tied, myPlayerId: 'z' })).toBe('none')
  })

  it('the host view is always the host tier, and a seatless client never drives', () => {
    expect(bingoDriverRole({ players: roster, myPlayerId: null, isHost: true })).toBe('host')
    expect(bingoDriverRole({ players: roster, myPlayerId: null })).toBe('none')
    expect(bingoDriverRole({ players: [], myPlayerId: null })).toBe('none')
  })

  it('fails over to the next-earliest player when the elected one leaves', () => {
    expect(bingoDriverRole({ players: roster, myPlayerId: 'b' })).toBe('none')
    const afterALeaves = roster.filter((p) => p.id !== 'a')
    expect(bingoDriverRole({ players: afterALeaves, myPlayerId: 'b' })).toBe('player')
    // still exactly one
    expect(
      afterALeaves
        .map((p) => bingoDriverRole({ players: afterALeaves, myPlayerId: p.id }))
        .filter((r) => r === 'player')
    ).toHaveLength(1)
  })

  it('skips spectators and eliminated players when electing', () => {
    const withSpectator = [
      player('spec', '2026-08-30T00:00:00Z', { spectator: true }),
      player('out', '2026-08-30T00:00:00.5Z', { is_eliminated: true }),
      ...roster,
    ]
    expect(bingoDriverRole({ players: withSpectator, myPlayerId: 'spec' })).toBe('none')
    expect(bingoDriverRole({ players: withSpectator, myPlayerId: 'out' })).toBe('none')
    expect(bingoDriverRole({ players: withSpectator, myPlayerId: 'a' })).toBe('player')
  })
})

describe('shouldRequestBingoCall', () => {
  const T0 = Date.parse('2026-08-30T12:00:00.000Z')
  const iso = (ms: number) => new Date(ms).toISOString()
  const base = { lastCalledAt: iso(T0), baselineMs: T0, callIntervalSeconds: 5 }

  it('never fires for a non-driver, however overdue the call is', () => {
    expect(shouldRequestBingoCall({ ...base, role: 'none', now: T0 + 10 * 60_000 })).toBe(false)
  })

  it('stays silent while the server ticker is keeping up — the whole cost saving', () => {
    // The ticker calls on time, so lastCalledAt keeps advancing and now - lastCalledAt
    // never exceeds the interval. No client ever pokes.
    for (let n = 0; n < 20; n++) {
      const lastCalledAt = iso(T0 + n * 5_000)
      const now = T0 + n * 5_000 + 4_900 // just before the next call is even due
      expect(shouldRequestBingoCall({ ...base, lastCalledAt, role: 'host', now })).toBe(false)
      expect(shouldRequestBingoCall({ ...base, lastCalledAt, role: 'player', now })).toBe(false)
    }
  })

  it('does not fire merely because the call is due — only once it is overdue by the grace', () => {
    const dueAt = T0 + 5_000
    expect(shouldRequestBingoCall({ ...base, role: 'host', now: dueAt })).toBe(false)
    expect(shouldRequestBingoCall({ ...base, role: 'host', now: dueAt + BINGO_HOST_GRACE_MS - 1 })).toBe(false)
    expect(shouldRequestBingoCall({ ...base, role: 'host', now: dueAt + BINGO_HOST_GRACE_MS })).toBe(true)
  })

  it('the host pre-empts the player: exactly one tier fires in the host window', () => {
    const dueAt = T0 + 5_000
    const now = dueAt + BINGO_HOST_GRACE_MS
    expect(shouldRequestBingoCall({ ...base, role: 'host', now })).toBe(true)
    // The elected player is still silent, so only ONE client is making requests.
    expect(shouldRequestBingoCall({ ...base, role: 'player', now })).toBe(false)
    expect(BINGO_PLAYER_GRACE_MS).toBeGreaterThan(BINGO_HOST_GRACE_MS)
  })

  it('fails over to the player with no gap when the host is gone too', () => {
    const dueAt = T0 + 5_000
    // Host tab closed => nothing calls => the call stays overdue past the player grace.
    expect(shouldRequestBingoCall({ ...base, role: 'player', now: dueAt + BINGO_PLAYER_GRACE_MS - 1 })).toBe(false)
    expect(shouldRequestBingoCall({ ...base, role: 'player', now: dueAt + BINGO_PLAYER_GRACE_MS })).toBe(true)
    // ...and keeps driving from then on, so the game cannot stall.
    expect(shouldRequestBingoCall({ ...base, role: 'player', now: dueAt + 60_000 })).toBe(true)
  })

  it('anchors on the baseline when no number has been called yet', () => {
    const started = T0
    const opts = { ...base, lastCalledAt: null, baselineMs: started, role: 'host' as const }
    // A game that has just started is not treated as infinitely overdue.
    expect(shouldRequestBingoCall({ ...opts, now: started + 100 })).toBe(false)
    expect(shouldRequestBingoCall({ ...opts, now: started + 5_000 + BINGO_HOST_GRACE_MS - 1 })).toBe(false)
    expect(shouldRequestBingoCall({ ...opts, now: started + 5_000 + BINGO_HOST_GRACE_MS })).toBe(true)
  })

  it('scales the due point with the game’s configured call interval', () => {
    const slow = { ...base, callIntervalSeconds: 15, role: 'host' as const }
    expect(shouldRequestBingoCall({ ...slow, now: T0 + 8_000 })).toBe(false)
    expect(shouldRequestBingoCall({ ...slow, now: T0 + 15_000 + BINGO_HOST_GRACE_MS })).toBe(true)
  })

  it('treats an unparseable timestamp as the baseline rather than firing forever', () => {
    const opts = { ...base, lastCalledAt: 'not-a-date', baselineMs: T0, role: 'host' as const }
    expect(shouldRequestBingoCall({ ...opts, now: T0 + 100 })).toBe(false)
  })
})

describe('bingoAutoCallPollIntervalMs', () => {
  it('is never faster than 4s and never slower than 8s, tracking the call cadence', () => {
    expect(bingoAutoCallPollIntervalMs(3)).toBe(4_000)
    expect(bingoAutoCallPollIntervalMs(5)).toBe(5_000)
    expect(bingoAutoCallPollIntervalMs(8)).toBe(8_000)
    expect(bingoAutoCallPollIntervalMs(15)).toBe(8_000)
  })

  it('is strictly slower than the 2s it replaced, in every configurable cadence', () => {
    for (const seconds of [3, 5, 8, 10, 15]) {
      expect(bingoAutoCallPollIntervalMs(seconds)).toBeGreaterThan(2_000)
    }
  })
})

describe('newestCalledAtOf', () => {
  it('returns null for an empty history', () => {
    expect(newestCalledAtOf([])).toBeNull()
  })

  it('returns the newest timestamp even if the array is not sorted ascending', () => {
    const rows = [
      { called_at: '2026-08-30T00:00:02Z' },
      { called_at: '2026-08-30T00:00:05Z' },
      { called_at: '2026-08-30T00:00:01Z' },
    ]
    expect(newestCalledAtOf(rows)).toBe('2026-08-30T00:00:05Z')
  })
})
