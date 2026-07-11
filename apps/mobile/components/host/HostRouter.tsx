import type { Game, Player } from '@fateround/shared'
import { isPollGame } from '@fateround/shared/poll-games'
import { BingoHostScreen } from '@/components/host/bingo/BingoHostScreen'
import { GenericHostScreen } from '@/components/host/GenericHostScreen'
import { MafiaHostScreen } from '@/components/host/mafia/MafiaHostScreen'
import { PollRoundHostScreen } from '@/components/host/poll/PollRoundHostScreen'
import { TriviaHostScreen } from '@/components/host/trivia/TriviaHostScreen'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

const POLL_ROUND_TYPES = new Set(['hot_seat', 'custom'])

export function HostRouter({ gameCode, hostToken, game, players, onReload }: Props) {
  const type = game.game_type

  if (type === 'bingo') {
    return (
      <BingoHostScreen
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        players={players}
        onReload={onReload}
      />
    )
  }

  if (type === 'trivia') {
    return (
      <TriviaHostScreen
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        players={players}
        onReload={onReload}
      />
    )
  }

  if (type === 'mafia') {
    return (
      <MafiaHostScreen
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        players={players}
        onReload={onReload}
      />
    )
  }

  if (isPollGame(type) || POLL_ROUND_TYPES.has(type)) {
    return (
      <PollRoundHostScreen
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        players={players}
        onReload={onReload}
      />
    )
  }

  return (
    <GenericHostScreen
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={onReload}
    />
  )
}
