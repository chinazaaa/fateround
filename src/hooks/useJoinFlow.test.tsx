// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  session: null as { playerId: string; playerName: string; playerGender: string; resumeToken: string | null } | null,
}))

vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const o: Record<string, unknown> = {
      select: () => o,
      eq: () => o,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
    }
    return o
  }
  return { supabase: { from: () => chain() } }
})
vi.mock('@/lib/utils', () => ({
  getPlayerSession: () => h.session,
  setPlayerSession: vi.fn(),
  clearPlayerSession: vi.fn(),
}))
vi.mock('@/lib/tournament-player-token', () => ({ currentTournamentPlayerToken: () => null }))
vi.mock('@/lib/sounds', () => ({ unlockAudio: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn(), GA_EVENTS: { joinGame: 'join_game' } }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/hooks/useRoomMemberJoin', () => ({
  useRoomMemberJoin: () => ({ displayName: null, joinExtras: {}, resolving: false }),
  useRoomMemberAutoJoin: vi.fn(),
  useRoomMemberNamePrefill: vi.fn(),
}))

import { useJoinFlow } from './useJoinFlow'

const GAME_CODE = 'ABCD'

// A name-only poll game (isNameOnlyPlayerJoin) so joinGame takes the simple name body.
const game = {
  id: GAME_CODE,
  game_type: 'never_have_i_ever',
  status: 'active',
  allow_viewers: true,
  allow_late_players: true,
  participant_mode: 'joiners',
} as never

function setup() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ playerId: 'p-new', playerName: 'Ada', playerGender: 'both', resumeToken: 'TOK-NEW' }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const rendered = renderHook(() =>
    useJoinFlow({
      gameCode: GAME_CODE,
      game,
      players: [],
      participants: [],
      myPlayerId: null,
      myPlayerName: null,
      view: 'join',
      setView: vi.fn(),
      setMyPlayerId: vi.fn(),
      setMyPlayerName: vi.fn(),
      setMyPlayerGender: vi.fn(),
      setPlayers: vi.fn(),
      setParticipants: vi.fn(),
      applyActiveRound: vi.fn(),
    } as never)
  )
  return { fetchMock, rendered }
}

function joinBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find((c) => c[0] === '/api/players')
  return JSON.parse((call?.[1] as { body: string }).body)
}

beforeEach(() => {
  h.session = null
  vi.clearAllMocks()
})

describe('useJoinFlow join', () => {
  it('sends the resume token so the server reclaims an existing seat', async () => {
    // This device already holds a seat (e.g. a racing auto-join, reconnect, second tab).
    h.session = { playerId: 'p-1', playerName: 'Ada', playerGender: 'both', resumeToken: 'TOK-1' }
    const { fetchMock, rendered } = setup()

    await act(async () => {
      await rendered.result.current.joinGame(undefined, 'Ada')
    })

    const body = joinBody(fetchMock)
    // Without this the server's reclaim branch can never fire, and an active-game join
    // mints a fresh spectator row — silently demoting a real player to a viewer.
    expect(body.resumeToken).toBe('TOK-1')
  })

  it('omits the resume token when this device holds no seat', async () => {
    // Covers both a genuine first-time joiner and a deliberate rejoin: leaving clears the
    // session, so there's no token and the server still cuts a fresh row.
    h.session = null
    const { fetchMock, rendered } = setup()

    await act(async () => {
      await rendered.result.current.joinGame(undefined, 'Grace')
    })

    expect(joinBody(fetchMock)).not.toHaveProperty('resumeToken')
  })
})
