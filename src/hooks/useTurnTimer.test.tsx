// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTurnTimer } from './useTurnTimer'

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

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString()

type Config = Parameters<typeof useTurnTimer>[0]

// Args are built ONCE (deadline captured at setup) so re-renders don't move the deadline.
function renderTimer(overrides: Partial<Config> = {}) {
  const args: Config = {
    gameCode: 'ABCD',
    endpoint: '/api/x/expire-turn',
    deadlineAt: inSeconds(3),
    hasTimer: true,
    ...overrides,
  }
  return renderHook(() => useTurnTimer(args))
}

describe('useTurnTimer', () => {
  it('counts down and POSTs { gameId } to the endpoint once when the deadline passes', async () => {
    const { result } = renderTimer()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.secondsLeft).toBeGreaterThan(0)
    expect(result.current.hasTimer).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x/expire-turn',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ gameId: 'ABCD' }) })
    )

    // cooldown de-dupes: still one call after further ticks within the 3s window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not run when hasTimer is false', async () => {
    const { result } = renderTimer({ hasTimer: false })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.hasTimer).toBe(false)
  })

  it('does not run when disabled', async () => {
    renderTimer({ enabled: false })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still counts down but never fires when canExpire is false (viewer watching)', async () => {
    const { result } = renderTimer({ deadlineAt: inSeconds(3), canExpire: false })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    // Countdown is visible…
    expect(result.current.secondsLeft).toBeGreaterThan(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    // …reaches zero, but the expire call is never made.
    expect(result.current.secondsLeft).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fire the expire call when gameCode is empty', async () => {
    renderTimer({ gameCode: '', deadlineAt: inSeconds(1) })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags urgent within the threshold and not above it', async () => {
    const within = renderTimer({ deadlineAt: inSeconds(8), urgentThreshold: 10 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(within.result.current.urgent).toBe(true)

    const above = renderTimer({ deadlineAt: inSeconds(12), urgentThreshold: 10 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(above.result.current.urgent).toBe(false)
  })

  it('swallows a fetch rejection and re-fires after the cooldown (no unhandled rejection)', async () => {
    // vitest fails the test on any unhandled rejection, so a rejecting fetch staying
    // green proves tick()'s catch handles it; the re-fire proves the cooldown re-arms.
    fetchMock.mockRejectedValue(new Error('network'))
    renderTimer({ deadlineAt: inSeconds(1), cooldownMs: 3000 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    const afterFirst = fetchMock.mock.calls.length
    expect(afterFirst).toBeGreaterThanOrEqual(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst)
  })
})
