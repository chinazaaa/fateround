import { useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { apiUrl } from '@/lib/config'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'

/**
 * Whole-game countdown trigger for the duration-capped board games (Monopoly,
 * Scrabble). Mirrors web's useGameExpiryTimer: once the session clock hits zero
 * it repeatedly POSTs `endpoint` until the game actually finishes and `active`
 * flips false. The server check is idempotent (it only finishes once the
 * duration has genuinely elapsed), so every client arming this is safe.
 *
 * Without this the mobile timer bar drains to 0:00 but nothing ever tells the
 * server to end the game — so an all-mobile table would sit "in progress"
 * forever. The retry is a self-scheduling setTimeout (never setInterval) so only
 * one request is ever in flight, and each attempt is abort-bounded so a hung
 * request can't stall the loop.
 *
 * `extraActive` lets a caller add a guard beyond "active + duration > 0"
 * (Scrabble's chess-clock mode has no whole-game cap, so it must never arm).
 *
 * `onExpired` (usually `bootstrap.load`) is called after each attempt so the view
 * re-fetches and lands on the finished screen even if the realtime `games` event is
 * dropped — mobile has no polling fallback, so without this a missed event leaves the
 * player stranded on the 0:00 board.
 */
export function useGameExpiryTimer({
  endpoint,
  game,
  extraActive = true,
  retryMs = 5000,
  onExpired,
}: {
  endpoint: string
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
  extraActive?: boolean
  retryMs?: number
  onExpired?: () => void | Promise<void>
}) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0 && extraActive
  const secondsLeft = useDeadlineCountdown(game?.session_started_at ?? null, duration, active)
  // Held in a ref so a fresh inline `onExpired` closure each render doesn't re-arm the timer.
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      const controller = new AbortController()
      const abortId = setTimeout(() => controller.abort(), retryMs)
      try {
        await fetch(apiUrl(endpoint), { method: 'POST', signal: controller.signal })
      } catch {
        // Swallow (including the AbortError when a request exceeds retryMs) — the
        // realtime `games` sync surfaces the finish; a failed attempt just retries.
      } finally {
        clearTimeout(abortId)
        // Re-fetch regardless of the response — realtime can miss the status flip, which
        // would otherwise strand the player on the 0:00 board until they leave and re-open.
        if (!cancelled) {
          void onExpiredRef.current?.()
          retryId = setTimeout(() => void fire(), retryMs)
        }
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, secondsLeft, endpoint, retryMs])
}
