import type { ReactNode } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import {
  GameFinishedScreen,
  type FinishedLeaderboardRow,
} from '@/components/game/GameChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { PlayAgainFooter } from '@/components/lifecycle/PlayAgainFooter'
import { HostFinishedActions } from '@/components/lifecycle/HostFinishedActions'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { useHostView } from '@/components/host/HostViewContext'
import { theme } from '@/constants/theme'

type BootstrapLike = {
  code: string
  game: Game | null
  players: Player[]
  myPlayerId?: string | null
  load: () => void | Promise<unknown>
}

type Props = {
  bootstrap: BootstrapLike
  title: string
  detail?: string | null
  subtitle?: string
  leaderboard?: FinishedLeaderboardRow[]
  primaryAction?: { label: string; onPress: () => void }
  showPlayAgain?: boolean
  emoji?: string
  /** Extra content rendered under the standings. */
  notice?: ReactNode
  /**
   * Winner's player id. When it's the local player, the finish screen posts the
   * win to the community leaderboard (and shows the confirmation).
   */
  winnerPlayerId?: string | null
  /** Distinct value per round (e.g. session id) so a replay posts again. */
  roundKey?: string | null
}

export function GameFinishPanel({
  bootstrap,
  title,
  detail,
  subtitle,
  leaderboard,
  primaryAction,
  showPlayAgain = true,
  emoji = '🏁',
  notice,
  winnerPlayerId,
  roundKey,
}: Props) {
  const game = bootstrap.game
  const host = useHostView()
  if (!game) return null

  const winner = winnerPlayerId ? bootstrap.players.find((p) => p.id === winnerPlayerId) : null
  const iWon = !!winner && !!bootstrap.myPlayerId && winner.id === bootstrap.myPlayerId

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      showsVerticalScrollIndicator={false}
    >
      <GameFinishedScreen
        title={title}
        detail={detail}
        subtitle={subtitle}
        leaderboard={leaderboard}
        primaryAction={primaryAction}
        emoji={emoji}
      />
      {notice}
      {iWon && winner ? (
        <PostWinToCommunity
          gameType={game.game_type}
          gameCode={bootstrap.code}
          winnerName={winner.name}
          roundKey={roundKey ?? null}
        />
      ) : null}
      {host ? (
        <HostFinishedActions gameCode={bootstrap.code} host={host} />
      ) : showPlayAgain ? (
        <PlayAgainFooter gameCode={bootstrap.code} game={game} onReplayReady={bootstrap.load} />
      ) : null}
      <GameFinishedActions
        gameCode={bootstrap.code}
        gameType={game.game_type}
        gameTitle={game.title}
        resultTitle={title}
        leaderboard={leaderboard}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
})
