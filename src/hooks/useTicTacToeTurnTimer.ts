'use client'

import type { TicTacToeSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useTicTacToeTurnTimer(gameCode: string, session: TicTacToeSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const status = session?.status ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/tic-tac-toe/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && status !== 'finished',
    enabled,
    resetKey: status,
  })
}
