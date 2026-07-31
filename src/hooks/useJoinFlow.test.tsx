// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  session: null as { playerId: string; playerName: string; playerGender: string; resumeToken: string | null } | null,
  roomMemberCode: undefined as string | undefined,
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
  useRoomMemberJoin: () => ({
    displayName: null,
    joinExtras: {},
    resolving: false,
    memberCode: h.roomMemberCode,
  }),
  useRoomMemberAutoJoin: vi.fn(),
  useRoomMemberNamePrefill: vi.fn(),
}))

import { useJoinFlow } from './useJoinFlow'
import { getRememberedName, rememberName } from '@/lib/identity-local'

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

function setup(initialName?: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ playerId: 'p-new', playerName: 'Ada', playerGender: 'both', resumeToken: 'TOK-NEW' }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const rendered = renderHook(
    (props: { initialName?: string }) =>
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
        initialName: props.initialName,
      } as never),
    { initialProps: { initialName } }
  )
  return { fetchMock, rendered }
}

/** The prefill effects defer their setState by a tick to avoid setState-in-effect churn. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function joinBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find((c) => c[0] === '/api/players')
  return JSON.parse((call?.[1] as { body: string }).body)
}

beforeEach(() => {
  h.session = null
  h.roomMemberCode = undefined
  localStorage.clear()
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

describe('useJoinFlow remembered name', () => {
  it('prefills the name this device used last time', async () => {
    rememberName('Ada')
    const { rendered } = setup()
    await flush()

    // The whole point of Slice 1: a returning player never retypes their name.
    expect(rendered.result.current.nameInput).toBe('Ada')
  })

  it('remembers the name after a successful join', async () => {
    const { rendered } = setup()

    await act(async () => {
      await rendered.result.current.joinGame(undefined, 'Grace')
    })

    expect(getRememberedName()).toBe('Grace')
  })

  it('stores the name that was sent, not the alias the server returns', async () => {
    // Anonymous games replace the typed name with a generated alias — remembering
    // "Ada" (the mocked server response) would rename the player on their next game.
    const { rendered } = setup()

    await act(async () => {
      await rendered.result.current.joinGame(undefined, 'Grace')
    })

    expect(getRememberedName()).not.toBe('Ada')
  })

  it('does not prefill when a tournament link supplies a name', async () => {
    rememberName('Ada')
    const { rendered } = setup('Grace')
    await flush()

    expect(rendered.result.current.nameInput).toBe('Grace')
  })

  it('does not prefill when arriving from a room link', async () => {
    // The room display name resolves asynchronously and must win; a prefill would
    // occupy the field and block it (useRoomMemberNamePrefill only fills empty fields).
    rememberName('Ada')
    h.roomMemberCode = 'MEMBER1'
    const { rendered } = setup()
    await flush()

    expect(rendered.result.current.nameInput).toBe('')
  })

  it('lets a late-resolving tournament name overwrite the prefill', async () => {
    // `initialName` is resolved client-side and is empty on first render. Without the
    // provenance flag the prefill would hold the field and the player would auto-join
    // under their remembered name instead of their tournament name.
    rememberName('Ada')
    const { rendered } = setup(undefined)
    await flush()
    expect(rendered.result.current.nameInput).toBe('Ada')

    rendered.rerender({ initialName: 'Grace' })
    await flush()

    expect(rendered.result.current.nameInput).toBe('Grace')
  })

  it('does not overwrite a name the player typed themselves', async () => {
    rememberName('Ada')
    const { rendered } = setup(undefined)
    await flush()

    act(() => rendered.result.current.setNameInput('Katherine'))
    rendered.rerender({ initialName: 'Grace' })
    await flush()

    expect(rendered.result.current.nameInput).toBe('Katherine')
  })
})
