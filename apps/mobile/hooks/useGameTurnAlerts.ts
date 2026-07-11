import { useEffect, useState } from 'react'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { isPushMutedForGame } from '@/lib/push-preferences'
import { subscribePlayerSession } from '@/lib/session-events'

type Args = {
  gameCode: string
  status: string | null | undefined
  isMyTurn?: boolean | null
  enabled?: boolean
  announce?: boolean
  startMessage?: string
  turnMessage?: string
}

/** Foreground turn toasts + respects per-game push mute from the session menu. */
export function useGameTurnAlerts({
  gameCode,
  status,
  isMyTurn = null,
  enabled = true,
  announce = true,
  startMessage,
  turnMessage,
}: Args) {
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let active = true
    const reload = async () => {
      const next = await isPushMutedForGame(gameCode)
      if (active) setMuted(next)
    }
    void reload()
    return subscribePlayerSession(gameCode, () => void reload())
  }, [gameCode])

  useTurnNotifications({
    status,
    isMyTurn,
    enabled: enabled && !muted,
    announce,
    startMessage,
    turnMessage,
  })
}
