// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRealtimeHealth, noteChannelStatus, registerChannel } from '@/lib/realtime-health'

import { POLL_INTERVALS, usePolling } from './usePolling'

/** Mark realtime as up, the way a subscribed channel would. */
function realtimeUp(): symbol {
  const token = registerChannel()
  noteChannelStatus(token, 'SUBSCRIBED')
  return token
}

beforeEach(() => {
  __resetRealtimeHealth()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePolling realtime gating', () => {
  it('polls at the full rate when realtime is down', async () => {
    const poll = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.realtimeFallback }))

    expect(poll).toHaveBeenCalledTimes(1) // runImmediately
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('stops polling entirely while realtime is healthy', async () => {
    realtimeUp()
    const poll = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.realtimeFallback }))

    // The first read still happens — a freshly mounted view needs something to render.
    expect(poll).toHaveBeenCalledTimes(1)

    // The old behaviour: another read here, every 15s, forever, on top of the realtime payloads
    // that already delivered the same rows. Ten minutes of a healthy channel used to cost 40
    // full refetches per client; it now costs none.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('does NOT slow polls that drive gameplay rather than back up realtime', async () => {
    realtimeUp()
    const poll = vi.fn().mockResolvedValue(undefined)
    // bingoAutoCall calls the next number; advanceSync advances the round. Slowing these would
    // break the game, not save money — so they must stay ungated even with realtime healthy.
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.bingoAutoCall }))

    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.bingoAutoCall)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('resumes immediately when a channel drops, then keeps the full rate', async () => {
    const token = registerChannel()
    noteChannelStatus(token, 'SUBSCRIBED')
    const poll = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.realtimeFallback }))
    expect(poll).toHaveBeenCalledTimes(1)

    // Suspended: no repeat while the channel is up.
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback * 3)
    expect(poll).toHaveBeenCalledTimes(1)

    noteChannelStatus(token, 'CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(0)
    // Reads once straight away rather than waiting out an interval — the view has been relying on
    // push and is already as stale as the outage is old.
    expect(poll).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('suspends again once realtime recovers', async () => {
    const token = registerChannel()
    noteChannelStatus(token, 'CHANNEL_ERROR')
    const poll = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.realtimeFallback }))

    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback)
    expect(poll).toHaveBeenCalledTimes(2) // polling normally while realtime is down

    noteChannelStatus(token, 'SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback * 5)
    expect(poll).toHaveBeenCalledTimes(2) // and stops again on recovery
  })

  it('does not schedule a backoff retry when realtime recovers during a failing in-flight poll', async () => {
    const token = registerChannel()
    noteChannelStatus(token, 'CHANNEL_ERROR')

    // A poll we can settle manually, so realtime can recover while it is still in flight.
    let settle!: (ok: boolean) => void
    const poll = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve
        })
    )
    renderHook(() => usePolling(poll, [], { intervalMs: POLL_INTERVALS.realtimeFallback }))
    expect(poll).toHaveBeenCalledTimes(1)

    // Realtime recovers while the poll is pending — the health callback has no timer to clear
    // yet, because the failure branch has not scheduled its backoff retry.
    noteChannelStatus(token, 'SUBSCRIBED')
    settle(false)
    await vi.advanceTimersByTimeAsync(0)

    // The failure branch must not schedule that retry now that realtime is healthy.
    await vi.advanceTimersByTimeAsync(10 * 60_000) // well past MAX_BACKOFF_MS
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('honours an explicit gateOnRealtime override', async () => {
    realtimeUp()
    const poll = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      usePolling(poll, [], {
        intervalMs: POLL_INTERVALS.realtimeFallback,
        gateOnRealtime: false,
      })
    )

    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.realtimeFallback)
    expect(poll).toHaveBeenCalledTimes(2)
  })
})
