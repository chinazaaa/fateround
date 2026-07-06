// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ gameRow: null as Record<string, unknown> | null, players: [] as unknown[] }))

vi.mock('@/lib/supabase', () => {
  const chain = (result: unknown) => {
    const o: Record<string, unknown> = {
      select: () => o,
      eq: () => o,
      maybeSingle: () => Promise.resolve(result),
      order: () => Promise.resolve(result),
    }
    return o
  }
  return {
    supabase: {
      from: (t: string) => chain({ data: t === 'games' ? h.gameRow : t === 'players' ? h.players : null, error: null }),
    },
  }
})
vi.mock('@/lib/player-resume', () => ({ resolvePlayerSession: vi.fn(async () => null) }))
vi.mock('@/lib/utils', () => ({ setPlayerSession: vi.fn(), getPlayerSession: vi.fn(() => null) }))

import { useGameViewBootstrap } from './useGameViewBootstrap'

beforeEach(() => {
  h.gameRow = null
  h.players = []
})

function setup(extra: Record<string, unknown> = {}) {
  const loadGameState = vi.fn(async () => ({ state: 'STATE', ok: true }))
  const computeScreen = vi.fn((g: { status?: string }) => (g.status === 'waiting' ? 'waiting' : 'active'))
  const rendered = renderHook(() =>
    useGameViewBootstrap<string, string>({
      gameCode: 'ABCD',
      loadingScreen: 'loading',
      notFoundScreen: 'not_found',
      loadGameState,
      computeScreen,
      ...extra,
    })
  )
  return { ...rendered, loadGameState, computeScreen }
}

describe('useGameViewBootstrap', () => {
  it('starts on the loading screen', () => {
    const { result } = setup()
    expect(result.current.screen).toBe('loading')
  })

  it('loads game + players, runs loadGameState + computeScreen, then sets the screen', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    h.players = [{ id: 'p1' }]
    const { result, loadGameState, computeScreen } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    expect(result.current.game).toEqual({ id: 'ABCD', status: 'waiting' })
    expect(result.current.players).toHaveLength(1)
    expect(loadGameState).toHaveBeenCalled()
    expect(computeScreen).toHaveBeenCalledWith({ id: 'ABCD', status: 'waiting' }, null, 'STATE')
  })

  it('shows the not-found screen when the game id is missing', async () => {
    h.gameRow = null
    const { result, loadGameState } = setup()
    await waitFor(() => expect(result.current.screen).toBe('not_found'))
    expect(loadGameState).not.toHaveBeenCalled() // short-circuits before the game-specific fetch
  })

  it('runs afterResolve after session resolution and enriches the state passed to computeScreen', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    h.players = [{ id: 'p1' }]
    const afterResolve = vi.fn(async () => 'ENRICHED')
    const { computeScreen } = setup({ afterResolve })
    await waitFor(() => expect(afterResolve).toHaveBeenCalled())
    // seam receives the resolved playerId (null via the mocked session) + the loadGameState state
    expect(afterResolve).toHaveBeenCalledWith({ id: 'ABCD', status: 'active' }, null, 'STATE')
    // the enriched return value — not the original 'STATE' — is what computeScreen sees
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'ENRICHED')
  })

  it('keeps the loadGameState state when afterResolve returns nothing', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const afterResolve = vi.fn(() => {})
    const { computeScreen } = setup({ afterResolve })
    await waitFor(() => expect(computeScreen).toHaveBeenCalled())
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'STATE')
  })

  it('calls onJoinSuccess with the raw API data after a successful join', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const onJoinSuccess = vi.fn()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ playerId: 'p9', playerName: 'Zed', resumeToken: 'RT', codewordsRole: 'spy' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup({ onJoinSuccess })
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    expect(onJoinSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p9', playerName: 'Zed', codewordsRole: 'spy' })
    )
    vi.unstubAllGlobals()
  })

  it('sends the stored resume token on join so the server reclaims an existing seat', async () => {
    // A device that already holds a seat (reconnect / refresh) must reclaim it rather than
    // create a new row — on an active game a new row defaults to spectator, demoting a player.
    const utils = await import('@/lib/utils')
    vi.mocked(utils.getPlayerSession).mockReturnValueOnce({
      playerId: 'p9',
      playerName: 'Zed',
      playerGender: 'both',
      resumeToken: 'RT-EXISTING',
    })
    h.gameRow = { id: 'ABCD', status: 'active' }
    h.players = [{ id: 'p9' }]
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ playerId: 'p9', playerName: 'Zed' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('active'))
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.resumeToken).toBe('RT-EXISTING')
    vi.unstubAllGlobals()
  })

  it('completes bootstrap even if afterResolve throws (falls back to loadGameState state)', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const afterResolve = vi.fn(async () => {
      throw new Error('boom')
    })
    const { result, computeScreen } = setup({ afterResolve })
    // screen is still computed (not stuck on 'loading') using the un-enriched state
    await waitFor(() => expect(result.current.screen).toBe('active'))
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'STATE')
    errSpy.mockRestore()
  })

  it('keeps a successful join successful when onJoinSuccess throws', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onJoinError = vi.fn()
    const onJoinSuccess = vi.fn(() => {
      throw new Error('callback boom')
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ playerId: 'p9', playerName: 'Zed', resumeToken: 'RT' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, loadGameState } = setup({ onJoinSuccess, onJoinError })
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    expect(loadGameState).toHaveBeenCalledTimes(1) // initial mount load
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    expect(onJoinSuccess).toHaveBeenCalled()
    expect(onJoinError).not.toHaveBeenCalled() // the throw was isolated, not treated as a join failure
    expect(loadGameState).toHaveBeenCalledTimes(2) // the post-join load() still ran despite the throw
    errSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
