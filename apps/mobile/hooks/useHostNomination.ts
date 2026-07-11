import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { uniqueTopic } from '@/lib/realtime'

/**
 * Tracks `games.pending_host_player_id` for a game in realtime (with an initial
 * fetch). Powers both sides of the host-transfer flow — the host's "waiting for
 * X" state and the nominee's invite banner. Batch 24.
 */
export function useHostNomination(gameCode: string): {
  pendingHostPlayerId: string | null
  loaded: boolean
  refetch: () => void
} {
  const [pendingHostPlayerId, setPending] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refetch = useCallback(() => {
    const supabase = getSupabase()
    void supabase
      .from('games')
      .select('pending_host_player_id')
      .eq('id', gameCode)
      .maybeSingle()
      .then(({ data }) => {
        setPending((data?.pending_host_player_id as string | null) ?? null)
        setLoaded(true)
      })
  }, [gameCode])

  useEffect(() => {
    refetch()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-nomination-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = (payload.new as { pending_host_player_id?: string | null } | null)
            ?.pending_host_player_id
          setPending(next ?? null)
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, refetch])

  return { pendingHostPlayerId, loaded, refetch }
}
