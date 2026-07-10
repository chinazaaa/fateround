import type { Game } from '@fateround/shared'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'

export function useTriviaRevealAdvance({
  gameCode,
  game,
  enabled = true,
  onAdvanced,
}: {
  gameCode: string
  game: Game
  enabled?: boolean
  onAdvanced?: () => void
}) {
  useAdvancePolling({
    endpoint: '/api/trivia/advance',
    gameCode,
    game,
    enabled,
    onAdvanced,
  })
}
