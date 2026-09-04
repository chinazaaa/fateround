import type { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

/**
 * Tracks whether Supabase Realtime is actually delivering, so `usePolling` can stand down while
 * it is.
 *
 * Why this exists: every fallback poll in the app ran unconditionally, in parallel with a healthy
 * realtime channel. `POLL_INTERVALS.realtimeFallback` was named for an intent nobody wired up --
 * there was no signal in the codebase saying whether realtime was up, so the polls could not
 * possibly have been conditional on it. Each connected client therefore refetched `games` and
 * `players` every 15s on top of the realtime payloads that had already delivered the same rows.
 *
 * Health is deliberately pessimistic: a page with no channels at all is NOT healthy, so polling
 * runs at full speed anywhere realtime is not in use. Only a page whose channels are ALL
 * `SUBSCRIBED` counts as healthy, and a single channel dropping to an error, timeout or close
 * flips the whole app back to full-speed polling immediately.
 */

type Status = `${REALTIME_SUBSCRIBE_STATES}` | 'PENDING'

/** Keyed by an opaque token per channel instance -- channel NAMES repeat across components. */
const statuses = new Map<symbol, Status>()
const listeners = new Set<() => void>()

let healthy = false

function recompute(): void {
  // `size > 0` is load-bearing: an empty map means "no realtime on this page", which must read as
  // unhealthy so the fallback polls keep running at their normal interval.
  const next = statuses.size > 0 && Array.from(statuses.values()).every((s) => s === 'SUBSCRIBED')
  if (next === healthy) return
  healthy = next
  for (const listener of listeners) listener()
}

export function registerChannel(): symbol {
  const token = Symbol('realtime-channel')
  statuses.set(token, 'PENDING')
  recompute()
  return token
}

export function noteChannelStatus(token: symbol, status: Status): void {
  if (!statuses.has(token)) return
  statuses.set(token, status)
  recompute()
}

export function unregisterChannel(token: symbol): void {
  if (!statuses.delete(token)) return
  recompute()
}

export function isRealtimeHealthy(): boolean {
  return healthy
}

export function subscribeToRealtimeHealth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only: drop all tracked channels. */
export function __resetRealtimeHealth(): void {
  statuses.clear()
  healthy = false
  for (const listener of listeners) listener()
}
