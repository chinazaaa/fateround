import { useEffect, useRef } from 'react'
import type { Player, UnoSession } from '@fateround/shared'
import { useToast } from '@/components/ui/Toast'
import { playSound } from '@/lib/sounds'

/**
 * Mobile-side Mercy knockout toast — mirrors src/hooks/useUnoNotifications (web).
 * Watches `session.eliminated_player_ids` for growth and fires a toast + `wrong`
 * sound per newly-added id. Seed the prior list on first mount so a mid-round join
 * doesn't re-announce KOs that already happened.
 */
export function useUnoMercyKnockoutAlerts({
  session,
  players,
  myPlayerId,
  enabled = true,
}: {
  session: UnoSession | null
  players: Player[]
  myPlayerId: string | null | undefined
  enabled?: boolean
}) {
  const { show } = useToast()
  const seededRef = useRef(false)
  const prevRef = useRef<string[]>([])

  useEffect(() => {
    if (!enabled || !session) return
    const next = (session.eliminated_player_ids ?? []) as string[]
    if (!seededRef.current) {
      seededRef.current = true
      prevRef.current = next
      return
    }
    const priorSet = new Set(prevRef.current)
    const newlyOut = next.filter((id) => !priorSet.has(id))
    if (newlyOut.length > 0) {
      for (const id of newlyOut) {
        if (id === myPlayerId) {
          show('💥 You were knocked out — 25 cards is the Mercy limit', 'error')
        } else {
          const name = players.find((p) => p.id === id)?.name
          show(`💥 ${name ?? 'A player'} was knocked out (25+ cards)`, 'info')
        }
      }
      playSound('wrong')
    }
    prevRef.current = next
  }, [enabled, session, players, myPlayerId, show])
}
