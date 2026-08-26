'use client'

import type { Game } from '@/types'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'

export function useGoFishGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  return useGameExpiryTimer({ endpoint: `/api/games/${gameCode}/expire-gofish`, game })
}
