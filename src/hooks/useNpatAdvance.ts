'use client'

import type { Game } from '@/types'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'

/** Auto-advances npat rounds via `/api/npat/advance`. See {@link useAdvancePolling}. */
export function useNpatAdvance(args: { gameCode: string; game: Game; enabled?: boolean; onAdvanced?: () => void }) {
  useAdvancePolling({ ...args, endpoint: '/api/npat/advance' })
}
