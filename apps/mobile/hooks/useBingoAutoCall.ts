import { useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { postBingoSync } from '@/lib/game-api'
import { useAppActive } from '@/hooks/useAppActive'

const INTERVAL_MS = 4000

/** Keeps automatic bingo calling in sync — any connected client can drive calls. */
export function useBingoAutoCall({
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

  const appActive = useAppActive()
  const autoMode = game?.bingo_call_mode === 'auto'
  const active = enabled && !!game && game.status === 'active' && autoMode && appActive

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const poll = async () => {
      if (inFlight.current || cancelled) return
      inFlight.current = true
      try {
        await postBingoSync(gameCode)
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
