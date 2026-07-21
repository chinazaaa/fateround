'use client'

import { useEffect, useRef } from 'react'

/** Polling intervals — Realtime is primary; these are slow fallbacks only. */
export const POLL_INTERVALS = {
  realtimeFallback: 15_000,
  /** Head-to-head games mid-match: a dropped realtime channel reads as raw move lag,
   *  and with only two clients per game the tighter poll is cheap. */
  duelFallback: 4_000,
  lobby: 8_000,
  activeGame: 10_000,
  results: 10_000,
  slow: 15_000,
  advanceSync: 3_000,
  bingoAutoCall: 2_000,
} as const

const MAX_BACKOFF_MS = 60_000

/**
 * Returns false when any result carries an error.
 *
 * Callers gate `setState(res.data ?? [])` on this, so ANY error has to be disqualifying,
 * not just a retriable one. A permission error (42501 — which this repo hits whenever a
 * column lacks a column-level GRANT, since migration 0122 made grants column-level)
 * arrives as `{ data: null, error }`; counting that as "ok" let callers apply `?? []` and
 * wipe a good roster to empty, rendering the game as though everyone had left.
 *
 * "No rows" is NOT an error here: client reads use `.maybeSingle()` or a plain select,
 * both of which return `{ data: null | [], error: null }` when empty — so a genuinely
 * empty read still applies normally. (`.single()` would report empty as a PGRST116
 * error, but it's confined to server routes, which don't use this helper.)
 */
export function supabasePollOk(...results: { error: unknown }[]): boolean {
  for (const r of results) {
    if (r.error) return false
  }
  return true
}

type UsePollingOptions = {
  intervalMs: number
  enabled?: boolean
  runImmediately?: boolean
}

/**
 * Polls on an interval with:
 * - pause while the browser tab is hidden
 * - exponential backoff on failures (any read error — transient or permanent)
 * - immediate refresh when the tab becomes visible again
 *
 * Poll should return `false` on failure, or throw. A permanent failure (e.g. a missing
 * GRANT) backs off to MAX_BACKOFF_MS rather than hammering the database at full rate.
 */
export function usePolling(
  poll: () => void | Promise<boolean | void>,
  deps: unknown[],
  { intervalMs, enabled = true, runImmediately = true }: UsePollingOptions
): void {
  const backoffRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef(poll)
  useEffect(() => {
    pollRef.current = poll
  }, [poll])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const schedule = (delay: number) => {
      if (cancelled) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void tick(), delay)
    }

    const tick = async () => {
      if (cancelled) return

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      let ok = true
      try {
        const result = await pollRef.current()
        if (result === false) ok = false
      } catch {
        ok = false
      }

      if (ok) {
        backoffRef.current = 0
        schedule(intervalMs)
      } else {
        backoffRef.current = Math.min(
          MAX_BACKOFF_MS,
          backoffRef.current === 0 ? intervalMs * 2 : backoffRef.current * 2
        )
        schedule(backoffRef.current)
      }
    }

    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current)
        void tick()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    if (runImmediately) void tick()
    else schedule(intervalMs)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, runImmediately, ...deps])
}

export const LOAD_TIMEOUT_MS = 15_000
