import type { Game, Player } from '@fateround/shared'
import { HostChrome } from '@/components/host/HostChrome'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

/**
 * Host surface for play-along games (Ayo, Whot, chess, …): the host sees and
 * plays the game, with all host controls behind the ⚙ Host button (players,
 * remove, end game, play again / return to lobby, settings). See HostChrome's
 * play-first mode + HostControlsSheet.
 */
export function GenericHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  return (
    <HostChrome
      playFirst
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={onReload}
    />
  )
}
