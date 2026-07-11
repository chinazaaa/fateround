import { useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { postQuickDrawAdvance } from '@/lib/game-api'

const INTERVAL_MS = 4000

/** Keeps Drawful (lie) phases advancing when deadlines expire. */
export function useQuickDrawAutoAdvance({
  gameCode,
  game,
  enabled = true,
  onSynced,
}: {
  gameCode: string
  game: Game | null
  enabled?: boolean
  onSynced?: () => void
}) {
  const inFlight = useRef(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  const active = enabled && !!game && game.status === 'active'

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const poll = async () => {
      if (inFlight.current || cancelled) return
      inFlight.current = true
      try {
        await postQuickDrawAdvance(gameCode)
        onSyncedRef.current?.()
      } catch {
        // retry next interval
      } finally {
        inFlight.current = false
      }
    }

    void poll()
    const id = setInterval(() => void poll(), INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [active, gameCode])
}
