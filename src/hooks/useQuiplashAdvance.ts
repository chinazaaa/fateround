'use client'

import { useAdvancePolling } from '@/hooks/useAdvancePolling'
import type { Game } from '@/types'

export function useQuiplashAdvance(args: { gameCode: string; game: Game; enabled?: boolean; onAdvanced?: () => void }) {
  useAdvancePolling({ ...args, endpoint: '/api/quiplash/advance' })
}
