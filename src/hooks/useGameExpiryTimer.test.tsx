// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameExpiryTimer } from './useGameExpiryTimer'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true } as Response)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Cfg = Parameters<typeof useGameExpiryTimer>[0]
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString()

// Args built ONCE so re-renders don't move the anchor.
function renderExpiry(overrides: Partial<Cfg> = {}) {
  const game = {
    status: 'active',
    session_started_at: secondsAgo(120),
    game_duration_seconds: 60,
  } as Cfg['game']
  const args: Cfg = { endpoint: '/api/games/ABCD/expire-crazy-eights', game, ...overrides }
  return renderHook(() => useGameExpiryTimer(args))
}

describe('useGameExpiryTimer', () => {
  it('exposes countdown state while active and not yet expired', async () => {
    const future = {
      status: 'active',
      session_started_at: new Date(Date.now()).toISOString(),
      game_duration_seconds: 60,
    } as Cfg['game']
    const { result } = renderExpiry({ game: future })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.active).toBe(true)
    expect(result.current.secondsLeft).toBeGreaterThan(0)
    expect(result.current.durationSeconds).toBe(60)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the expire endpoint once expired and retries', async () => {
    renderExpiry() // started 120s ago, 60s duration -> already expired
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/games/ABCD/expire-crazy-eights', { method: 'POST' })
    const first = fetchMock.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(first)
  })

  it('does not arm when the game is not active', async () => {
    const done = {
      status: 'finished',
      session_started_at: secondsAgo(120),
      game_duration_seconds: 60,
    } as Cfg['game']
    const { result } = renderExpiry({ game: done })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(result.current.active).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not arm when extraActive is false (e.g. scrabble chess-clock)', async () => {
    renderExpiry({ extraActive: false })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps only one request in flight when the expire call is slow (no setInterval overlap)', async () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // never resolves
    renderExpiry()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    // self-scheduling setTimeout waits for the await, so no stacked requests
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
