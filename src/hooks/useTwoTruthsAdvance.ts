'use client'

import type { Game } from '@/types'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'

/** Auto-advances two-truths rounds via `/api/two-truths/advance`. See {@link useAdvancePolling}. */
export function useTwoTruthsAdvance(args: {
  gameCode: string
  game: Game
  enabled?: boolean
  onAdvanced?: () => void
}) {
  useAdvancePolling({ ...args, endpoint: '/api/two-truths/advance' })
}
