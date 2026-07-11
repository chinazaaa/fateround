import { useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { apiUrl } from '@/lib/config'

const DEFAULT_INTERVAL_MS = 4000

export function useAdvancePolling({
  endpoint,
  gameCode,
  game,
  enabled = true,
  onAdvanced,
  intervalMs = DEFAULT_INTERVAL_MS,
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

  useEffect(() => {
    if (!enabled || game.status !== 'active') return

    let cancelled = false

    const poll = async () => {
      if (inFlight.current || cancelled) return
      inFlight.current = true
      try {
        const res = await fetch(apiUrl(endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode.toUpperCase() }),
        })
        if (res.ok) onAdvancedRef.current?.()
      } catch {
        // retry on next interval
      } finally {
        inFlight.current = false
      }
    }

    void poll()
    const id = setInterval(() => void poll(), intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled, endpoint, game.status, gameCode, intervalMs])
}
