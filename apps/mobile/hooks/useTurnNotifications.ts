import { useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/Toast'
import { pulseTurnAlert } from '@/lib/local-turn-alerts'

/**
 * Foreground turn + game-start alerts when push is disabled or the app is open.
 * Mirrors the web `useTurnNotifications` hook.
 */
export function useTurnNotifications({
  status,
  isMyTurn = null,
  enabled = true,
  announce = true,
  startMessage = 'Game started! 🎮',
  turnMessage = 'Your turn!',
}: {
  status: string | null | undefined
  isMyTurn?: boolean | null
  enabled?: boolean
  announce?: boolean
  startMessage?: string
  turnMessage?: string
}) {
  const { show } = useToast()
  const readyRef = useRef(false)
  const prevStatusRef = useRef<string | null | undefined>(undefined)
  const prevMyTurnRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (!readyRef.current) {
      readyRef.current = true
      prevStatusRef.current = status
      prevMyTurnRef.current = isMyTurn
      return
    }

    const prevStatus = prevStatusRef.current
    const prevMyTurn = prevMyTurnRef.current

    if (prevStatus === 'waiting' && status === 'active') {
      if (announce) {
        show(startMessage, 'info')
        void pulseTurnAlert('turn')
      }
    } else if (status === 'active' && prevStatus === 'active' && isMyTurn === true && prevMyTurn !== true) {
      if (announce) {
        show(turnMessage, 'info')
        void pulseTurnAlert('turn')
      }
    }

    prevStatusRef.current = status
    prevMyTurnRef.current = isMyTurn
  }, [enabled, status, isMyTurn, announce, startMessage, turnMessage, show])
}
