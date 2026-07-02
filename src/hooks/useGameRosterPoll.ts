'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import type { Game, Player } from '@/types'

/**
 * Realtime-fallback poll for views whose full reload is unsafe to run repeatedly
 * mid-game (sudoku / word hunt keep local drafts a reload would clobber, so they
 * can't use the plain `usePolling(load)` net the other game views have).
 *
 * Realtime stays the primary transport — this catches what it misses (players
 * joining while the websocket is still connecting, dropped connections): every
 * tick refreshes the roster, while the full `reload` runs only on a game status
 * transition, where a re-derive is safe and wanted.
 */
export function useGameRosterPoll(
  gameCode: string,
  status: Game['status'] | undefined,
  handlers: {
    setGame: (game: Game) => void
    setPlayers: (players: Player[]) => void
    reload: () => void | Promise<unknown>
  }
) {
  // Latest status/handlers without resubscribing the poll; synced in a passive
  // effect to satisfy react-hooks/refs (same pattern as useGameChannel).
  const ref = useRef({ status, ...handlers })
  useEffect(() => {
    ref.current = { status, ...handlers }
  })

  usePolling(
    async () => {
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      ])
      if (!supabasePollOk(gameRes, playersRes)) return false

      if (playersRes.data) ref.current.setPlayers(playersRes.data as unknown as Player[])

      const game = gameRes.data as Game | null
      if (!game) return
      // Refresh `game` every tick so non-status changes (e.g. max_players,
      // allow_late_players from the lobby settings panel) aren't lost when their
      // realtime event is the one dropped. The full reload stays gated on a status
      // transition, where re-deriving from scratch is safe for in-progress drafts.
      ref.current.setGame(game)
      if (game.status !== ref.current.status) {
        await ref.current.reload()
      }
    },
    [gameCode],
    // The mount `load()` already ran; the poll is purely a catch-up net.
    { intervalMs: POLL_INTERVALS.realtimeFallback, runImmediately: false }
  )
}
