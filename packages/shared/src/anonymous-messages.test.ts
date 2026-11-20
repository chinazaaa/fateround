import { describe, expect, it } from 'vitest'
import { anonymousPlayerCanChat, anonymousPlayerCanPost, countAnonymousRoomPresence } from './anonymous-messages'

const joinedAt = '2026-01-01T00:00:00Z'
const waiting = { status: 'waiting' as const, session_started_at: null }

describe('anonymousPlayerCanChat in a waiting room', () => {
  it('lets a normal lobby participant chat', () => {
    expect(anonymousPlayerCanChat({ joined_at: joinedAt, spectator: false }, waiting)).toBe(true)
  })

  it('does not let an explicit watch-only viewer chat or post', () => {
    const viewer = { joined_at: joinedAt, spectator: true }
    expect(anonymousPlayerCanChat(viewer, waiting)).toBe(false)
    expect(anonymousPlayerCanPost(viewer, waiting)).toBe(false)
  })

  it('counts a waiting-room viewer as a viewer, not a participant', () => {
    const players = [
      { joined_at: joinedAt, spectator: false },
      { joined_at: joinedAt, spectator: true },
    ]
    expect(countAnonymousRoomPresence(players, waiting)).toEqual({ total: 2, participants: 1, viewers: 1 })
  })

  it('keeps active-room behaviour: only pre-start non-spectators chat', () => {
    const active = { status: 'active' as const, session_started_at: '2026-01-01T00:10:00Z' }
    expect(anonymousPlayerCanChat({ joined_at: joinedAt, spectator: false }, active)).toBe(true)
    expect(anonymousPlayerCanChat({ joined_at: '2026-01-01T00:20:00Z', spectator: false }, active)).toBe(false)
    expect(anonymousPlayerCanChat({ joined_at: joinedAt, spectator: true }, active)).toBe(false)
  })
})

describe('lobby seat counting with a viewer admitted to a full room', () => {
  it('counts 20 participants + 1 viewer as 20 seated and 1 viewing (not 21 / 20)', () => {
    const players = [
      ...Array.from({ length: 20 }, () => ({ joined_at: joinedAt, spectator: false })),
      { joined_at: joinedAt, spectator: true },
    ]
    expect(countAnonymousRoomPresence(players, waiting)).toEqual({ total: 21, participants: 20, viewers: 1 })
  })
})
