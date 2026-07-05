'use client'

import type { Game } from '@/types'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'

/**
 * Polls `/api/trivia/advance` so rounds auto-end and advance even if the host tab is
 * backgrounded. See {@link useAdvancePolling}. (`rounds` is accepted for call-site
 * compatibility but unused — the server decides when to advance.)
 */
export function useTriviaRevealAdvance({
  rounds: _rounds,
  ...args
}: {
  gameCode: string
  game: Game
  rounds?: unknown
  enabled?: boolean
  onAdvanced?: () => void
}) {
  useAdvancePolling({ ...args, endpoint: '/api/trivia/advance' })
}
