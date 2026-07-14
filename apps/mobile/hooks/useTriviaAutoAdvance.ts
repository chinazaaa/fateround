import { useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { postTriviaAdvance } from '@/lib/game-api'
import { useAppActive } from '@/hooks/useAppActive'

const INTERVAL_MS = 4000

/** Keeps trivia rounds advancing — any connected client can drive reveal/advance. */
export function useTriviaAutoAdvance({
  gameCode,
  game,
  hostToken,
  enabled = true,
  onSynced,
}: {
  gameCode: string
  game: Game | null
  hostToken?: string
  enabled?: boolean
  onSynced?: () => void
}) {
  const inFlight = useRef(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  const appActive = useAppActive()
  const active = enabled && !!game && game.status === 'active' && appActive

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const poll = async () => {
      if (inFlight.current || cancelled) return
      inFlight.current = true
      try {
        await postTriviaAdvance(gameCode, { hostToken, force: false })
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
  }, [active, gameCode, hostToken])
}
