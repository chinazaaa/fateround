'use client'

import { useRef } from 'react'
import type { Game } from '@/types'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'

/**
 * Generic "auto-advance" poller shared by the round-based games (npat, two-truths,
 * trivia). While the game is active it POSTs `{ gameId }` to the game's `advance`
 * endpoint on an interval so rounds auto-end/advance even if the driving tab is
 * backgrounded — a slow fallback behind Realtime. An `inFlight` ref de-dupes so a
 * slow request never stacks, and a non-OK/throw returns `false` to hand `usePolling`
 * its exponential backoff. `onAdvanced` fires after each successful poll.
 */
export function useAdvancePolling({
  endpoint,
  gameCode,
  game,
  enabled = true,
  onAdvanced,
  intervalMs = POLL_INTERVALS.advanceSync,
}: {
  endpoint: string
  gameCode: string
  game: Game
  enabled?: boolean
  onAdvanced?: () => void
  intervalMs?: number
}) {
  const inFlight = useRef(false)
  const onAdvancedRef = useRef(onAdvanced)
  onAdvancedRef.current = onAdvanced

  usePolling(
    async () => {
      if (inFlight.current) return true
      inFlight.current = true
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        })
        if (!res.ok) return false
        onAdvancedRef.current?.()
        return true
      } catch {
        return false
      } finally {
        inFlight.current = false
      }
    },
    [gameCode, game.status],
    { intervalMs, enabled: !!enabled && game.status === 'active' }
  )
}
