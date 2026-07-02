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

export function isRetriablePollError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string; status?: number }
  if (e.status === 503 || e.status === 504) return true
  if (e.code === 'PGRST000' || e.code === 'PGRST001' || e.code === 'PGRST002' || e.code === 'PGRST003') {
    return true
  }
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('timeout') || msg.includes('schema cache') || msg.includes('fetch failed') || msg.includes('network')
  )
}

/** Returns false when any result has a retriable Supabase/PostgREST error. */
export function supabasePollOk(...results: { error: unknown }[]): boolean {
  for (const r of results) {
    if (r.error && isRetriablePollError(r.error)) return false
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
 * - exponential backoff on failures (503 / PGRST002 / network)
 * - immediate refresh when the tab becomes visible again
 *
 * Poll should return `false` on retriable failure, or throw.
 */
export function usePolling(
  poll: () => void | Promise<boolean | void>,
  deps: unknown[],
  { intervalMs, enabled = true, runImmediately = true }: UsePollingOptions
): void {
  const backoffRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef(poll)
  pollRef.current = poll

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
