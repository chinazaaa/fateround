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

  it('backs off exponentially while the server keeps answering { skipped: true }', async () => {
    // The runaway this guards: server judges the turn not expirable (finished session, or
    // client clock ahead), so it returns skipped. Without back-off the client re-POSTs
    // every cooldown forever — every connected client, each call a full game-state read.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, skipped: true }) } as unknown as Response)
    renderTimer({ deadlineAt: inSeconds(1), cooldownMs: 1000, maxBackoffMs: 60000 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Re-arm is now 2s (1000 * 2^1), so at +1.5s it must NOT have fired again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Past the 2s re-arm it fires a second time, which pushes the next re-arm to 4s
    // (1000 * 2^2) — so 3s of ticks is deliberately not enough to earn a third call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Only once the 4s re-arm elapses does the third call go out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Compare against the old behaviour: a flat 1s cooldown over this same ~9s window
    // would have fired ~9 times instead of 3, and the gap keeps widening from here.
    expect(fetchMock.mock.calls.length).toBeLessThan(5)
  })

  it('does not back off while the server is actually acting on the expire', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, skipped: false }) } as unknown as Response)
    renderTimer({ deadlineAt: inSeconds(1), cooldownMs: 1000 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Flat cooldown retained (no back-off), so the next tick past 1s fires again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('backs off on a 4xx too, so a dead game code cannot be hammered forever', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Game not found' }),
    } as unknown as Response)
    renderTimer({ deadlineAt: inSeconds(1), cooldownMs: 1000 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
