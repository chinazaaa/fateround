'use client'

import { useEffect, useRef } from 'react'

const FIRST_ASK_MS = 4000
const RETRY_MS = 6000

/**
 * Once this player's own puzzle is done and the game is still running, ask the server to re-run the
 * "is everyone done?" check. The submit route finishes the game when the last player finishes, but
 * if that finish failed after the guess was committed, nothing on the client would retry it (the
 * realtime update disables further submissions) and an untimed game would sit there until the idle
 * reaper closed it as `idle_timeout`. The first ask waits a few seconds so the normal in-request
 * finish lands first (the screen then moves on and nothing is sent); it repeats until the server
 * reports the game finished, the endpoint answers a permanent 4xx, or the caller turns `enabled` off.
 */
export function useWordGroupingCompletionNudge(gameCode: string, enabled: boolean, onFinished?: () => void) {
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    const stop = () => {
      if (interval !== undefined) {
        clearInterval(interval)
        interval = undefined
      }
    }
    const ask = async () => {
      try {
        const res = await fetch('/api/word-grouping/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        })
        if (cancelled) return
        if (!res.ok) {
          // Retry only transient failures (5xx, 408, 429, and network errors via the catch). Any other 4xx —
          // unknown game, not a Word Grouping game, a bad request — is permanent: asking again every few
          // seconds cannot change the answer, so stop.
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) stop()
          return
        }
        const data = (await res.json().catch(() => ({}))) as { finished?: boolean }
        if (cancelled) return
        if (data.finished) {
          stop()
          onFinishedRef.current?.()
        }
      } catch {
        // Best-effort: the next tick retries.
      }
    }

    const first = setTimeout(() => {
      void ask()
      interval = setInterval(() => void ask(), RETRY_MS)
    }, FIRST_ASK_MS)

    return () => {
      cancelled = true
      clearTimeout(first)
      stop()
    }
  }, [enabled, gameCode])
}
