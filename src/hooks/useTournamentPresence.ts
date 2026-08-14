'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Supabase Realtime presence for a tournament lobby. Everyone with a lobby
 * tab open is tracked; the returned Set holds every present `presenceKey`
 * seen on the channel (typically the viewer's tournament_players.id, or a
 * synthetic id for the host and spectators).
 *
 * Pass `presenceKey = null` to LISTEN without contributing your own presence
 * — useful for a big-screen render on a laptop that shouldn't be counted
 * as a pre-registered player.
 *
 * The channel is scoped per tournament and cleaned up on unmount, so
 * navigating away drops the viewer from the presence state immediately.
 */
export function useTournamentPresence(tournamentId: string | null | undefined, presenceKey: string | null) {
  const [presentKeys, setPresentKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!tournamentId) return
    const channel = supabase.channel(`tournament_presence:${tournamentId}`, {
      config: { presence: { key: presenceKey ?? '' } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ id: string }>()
        const online = new Set<string>()
        for (const rows of Object.values(state)) {
          for (const row of rows) {
            if (typeof row?.id === 'string' && row.id) online.add(row.id)
          }
        }
        setPresentKeys(online)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && presenceKey) {
          // Track only when we have a real key to publish; a null key means
          // "listen only" (e.g. the big screen shouldn't count itself).
          void channel.track({ id: presenceKey })
        }
      })

    return () => {
      // Removing the channel unsubscribes AND untracks this viewer, so other
      // clients see us leave immediately (rather than after the presence TTL).
      void supabase.removeChannel(channel)
    }
  }, [tournamentId, presenceKey])

  return presentKeys
}
