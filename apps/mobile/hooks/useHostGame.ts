import { useCallback, useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import type { Game, Player } from '@fateround/shared'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'

// Supabase postgres_changes occasionally drops a players INSERT/UPDATE event, and the
// lobby (join / ready-up / play-again ring) has no other traffic to mask a drop the way
// active play does. Reconcile on a short poll while waiting, on top of realtime.
const LOBBY_POLL_INTERVAL_MS = 8000

export function useHostGame(gameCode: string) {
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const supabase = getSupabase()
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!gameRes.error && gameRes.data) setGame(gameRes.data as Game)
    if (!playersRes.error) setPlayers((playersRes.data ?? []) as Player[])
    setLoading(false)
    return !gameRes.error && !!gameRes.data
  }, [gameCode])

  useEffect(() => {
    void reload()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-game-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => void reload()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void reload()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, reload])

  useEffect(() => {
    if (game?.status !== 'waiting') return
    const id = setInterval(() => void reload(), LOBBY_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [game?.status, reload])

  return { game, players, loading, reload }
}
