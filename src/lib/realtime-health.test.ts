import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetRealtimeHealth,
  isRealtimeHealthy,
  noteChannelStatus,
  registerChannel,
  subscribeToRealtimeHealth,
  unregisterChannel,
} from './realtime-health'

beforeEach(() => {
  __resetRealtimeHealth()
})

describe('realtime health', () => {
  it('is NOT healthy when nothing is subscribed', () => {
    // The load-bearing default. A page with no channels must read as unhealthy so its fallback
    // polls keep running at full speed — treating "no realtime" as "realtime fine" would silently
    // slow every poll on every non-realtime page.
    expect(isRealtimeHealthy()).toBe(false)
  })

  it('is not healthy while a channel is still connecting', () => {
    registerChannel()
    expect(isRealtimeHealthy()).toBe(false)
  })

  it('becomes healthy once the channel subscribes', () => {
    const token = registerChannel()
    noteChannelStatus(token, 'SUBSCRIBED')
    expect(isRealtimeHealthy()).toBe(true)
  })

  it('requires EVERY channel to be subscribed, not just one', () => {
    const a = registerChannel()
    const b = registerChannel()
    noteChannelStatus(a, 'SUBSCRIBED')
    expect(isRealtimeHealthy()).toBe(false)
    noteChannelStatus(b, 'SUBSCRIBED')
    expect(isRealtimeHealthy()).toBe(true)
  })

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'drops to unhealthy when a channel reports %s',
    (status) => {
      const a = registerChannel()
      const b = registerChannel()
      noteChannelStatus(a, 'SUBSCRIBED')
      noteChannelStatus(b, 'SUBSCRIBED')
      expect(isRealtimeHealthy()).toBe(true)

      noteChannelStatus(b, status)
      expect(isRealtimeHealthy()).toBe(false)
    }
  )

  it('recovers when a failed channel is removed and the rest are healthy', () => {
    const a = registerChannel()
    const b = registerChannel()
    noteChannelStatus(a, 'SUBSCRIBED')
    noteChannelStatus(b, 'CHANNEL_ERROR')
    expect(isRealtimeHealthy()).toBe(false)

    unregisterChannel(b)
    expect(isRealtimeHealthy()).toBe(true)
  })

  it('tracks channels separately even when they share a name', () => {
    // Channel names repeat across components (several views open `game:${code}`), which is why
    // the store keys on an opaque per-instance token rather than the name.
    const first = registerChannel()
    const second = registerChannel()
    noteChannelStatus(first, 'SUBSCRIBED')
    noteChannelStatus(second, 'SUBSCRIBED')
    expect(isRealtimeHealthy()).toBe(true)

    unregisterChannel(first)
    expect(isRealtimeHealthy()).toBe(true)
  })

  it('notifies subscribers only when the verdict actually changes', () => {
    const listener = vi.fn()
    subscribeToRealtimeHealth(listener)

    const a = registerChannel()
    const b = registerChannel()
    expect(listener).not.toHaveBeenCalled() // still unhealthy — no change

    noteChannelStatus(a, 'SUBSCRIBED')
    expect(listener).not.toHaveBeenCalled() // b outstanding, still unhealthy

    noteChannelStatus(b, 'SUBSCRIBED')
    expect(listener).toHaveBeenCalledTimes(1) // false -> true
  })

  it('ignores status for a channel that was already removed', () => {
    const token = registerChannel()
    noteChannelStatus(token, 'SUBSCRIBED')
    unregisterChannel(token)

    // A late callback from a torn-down channel must not resurrect it into the health set.
    noteChannelStatus(token, 'SUBSCRIBED')
    expect(isRealtimeHealthy()).toBe(false)
  })
})
