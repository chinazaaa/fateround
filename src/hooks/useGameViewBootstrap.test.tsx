// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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
vi.mock('@/lib/utils', () => ({ setPlayerSession: vi.fn() }))

import { useGameViewBootstrap } from './useGameViewBootstrap'

beforeEach(() => {
  h.gameRow = null
  h.players = []
})

function setup() {
  const loadGameState = vi.fn(async () => ({ state: 'STATE', ok: true }))
  const computeScreen = vi.fn((g: { status?: string }) => (g.status === 'waiting' ? 'waiting' : 'active'))
  const rendered = renderHook(() =>
    useGameViewBootstrap<string, string>({
      gameCode: 'ABCD',
      loadingScreen: 'loading',
      notFoundScreen: 'not_found',
      loadGameState,
      computeScreen,
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
})
