'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useTournamentRealtime(tournamentId: string, onUpdate: () => void) {
  useEffect(() => {
    if (!tournamentId) return

    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournaments',
          filter: `id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_players',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_games',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId, onUpdate])
}
