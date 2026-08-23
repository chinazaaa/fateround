'use client'

import type { MonopolyBoard, MonopolyPhase } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

const TIMED_PHASES: MonopolyPhase[] = ['roll', 'jail', 'buy', 'pay_rent', 'raise_funds', 'auction']

export function useMonopolyTurnTimer(gameCode: string, board: MonopolyBoard | null, enabled: boolean) {
  const deadlineAt = board?.turn_deadline_at ?? null
  const phase = board?.phase ?? null
  const timed = !!phase && TIMED_PHASES.includes(phase)
  return useTurnTimer({
    gameCode,
    endpoint: '/api/monopoly/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && timed,
    enabled,
    resetKey: `${phase}:${board?.current_turn_index}:${board?.auction_state?.current_bidder_id ?? ''}`,
    urgentThreshold: 15,
  })
}
