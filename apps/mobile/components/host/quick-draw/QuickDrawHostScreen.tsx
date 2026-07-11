import type { Game, Player } from '@fateround/shared'
import { isQuickDrawGuessVariant } from '@fateround/shared/quick-draw-guess'
import { HostChrome } from '@/components/host/HostChrome'
import { useQuickDrawAutoAdvance } from '@/hooks/useQuickDrawAutoAdvance'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

/**
 * Quick Draw is play-first: the host plays through the shared player view
 * (drawing / guessing), and host controls live behind the ⚙ Host settings sheet
 * (End game, Play again, and "Skip to next phase" via QuickDrawHostAdvanceControl).
 * This wrapper's only extra job is keeping the Drawful auto-advance loop running
 * for the host; everything else HostChrome + the player view already handle.
 */
export function QuickDrawHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const isGuess = isQuickDrawGuessVariant(game.quick_draw_variant)

  useQuickDrawAutoAdvance({
    gameCode,
    game,
    enabled: !isGuess && game.status === 'active',
    onSynced: onReload,
  })

  return (
    <HostChrome
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={onReload}
      playFirst
    />
  )
}
