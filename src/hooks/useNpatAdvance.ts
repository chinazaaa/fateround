'use client'

import { useRef } from 'react'
import type { Game } from '@/types'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'

export function useNpatAdvance({
  gameCode,
  game,
  enabled = true,
  onAdvanced,
}: {
  gameCode: string
  game: Game
  enabled?: boolean
  onAdvanced?: () => void
}) {
  const inFlight = useRef(false)
  const onAdvancedRef = useRef(onAdvanced)
  onAdvancedRef.current = onAdvanced

  usePolling(
    async () => {
      if (inFlight.current) return true
      inFlight.current = true
      try {
        const res = await fetch('/api/npat/advance', {
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
    { intervalMs: POLL_INTERVALS.advanceSync, enabled: !!enabled && game.status === 'active' }
  )
}
