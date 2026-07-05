'use client'

import type { Game } from '@/types'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'

/** Whole-game countdown for Scrabble. Mirrors the other board-game clocks, but is
 *  disarmed in chess-clock mode — the per-player banks drive timing there, so a stale
 *  nonzero duration must never end a chess game early via /expire-scrabble. */
export function useScrabbleGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds' | 'scrabble_clock_mode'> | null
) {
  return useGameExpiryTimer({
    endpoint: `/api/games/${gameCode}/expire-scrabble`,
    game,
    extraActive: game?.scrabble_clock_mode !== 'chess',
  })
}
