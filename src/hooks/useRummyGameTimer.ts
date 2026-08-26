'use client'

import type { Game } from '@/types'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'

/** Whole-game countdown for Rummy — ticks to session_started_at + game_duration_seconds and,
 *  once zero, pokes the server endpoint until the game actually flips to finished. */
export function useRummyGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  return useGameExpiryTimer({ endpoint: `/api/games/${gameCode}/expire-rummy`, game })
}
