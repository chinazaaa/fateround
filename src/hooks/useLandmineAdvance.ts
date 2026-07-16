'use client'

import type { Game } from '@/types'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'

/** Auto-advances Landmine rounds via `/api/landmine/advance`. See {@link useAdvancePolling}. */
export function useLandmineAdvance(args: { gameCode: string; game: Game; enabled?: boolean; onAdvanced?: () => void }) {
  useAdvancePolling({ ...args, endpoint: '/api/landmine/advance' })
}
