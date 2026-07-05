'use client'

import type { Game } from '@/types'
import { useGameExpiryTimer } from '@/hooks/useGameExpiryTimer'

export function useCrazyEightsGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  return useGameExpiryTimer({ endpoint: `/api/games/${gameCode}/expire-crazy-eights`, game })
}
