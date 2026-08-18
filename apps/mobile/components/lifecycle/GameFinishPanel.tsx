import type { ReactNode } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { GameFinishedScreen, type FinishedLeaderboardRow } from '@/components/game/GameChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { PlayAgainFooter } from '@/components/lifecycle/PlayAgainFooter'
import { HostFinishedActions } from '@/components/lifecycle/HostFinishedActions'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { PostJoinSubscribeNudge } from '@/components/notifications/PostJoinSubscribeNudge'
import { useHostView } from '@/components/host/HostViewContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

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
   * Suppress the generic winner hero + leaderboard block when `notice` already
   * renders a self-contained results card (e.g. Monopoly's share card). The
   * `title`/`leaderboard` props are still used by the footer share actions.
   */
  hideDefaultHeader?: boolean
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
  hideDefaultHeader = false,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const game = bootstrap.game
  const host = useHostView()
  if (!game) return null

  const winner = winnerPlayerId ? bootstrap.players.find((p) => p.id === winnerPlayerId) : null
  const iWon = !!winner && !!bootstrap.myPlayerId && winner.id === bootstrap.myPlayerId
  // Trophy when there's a winner, otherwise the game's finish emoji — the same
  // hero emoji feeds the on-screen card and the shared image so they match.
  const heroEmoji = winner ? '🏆' : emoji

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      {hideDefaultHeader ? null : (
        <GameFinishedScreen
          title={title}
          detail={detail}
          subtitle={subtitle}
          leaderboard={leaderboard}
          primaryAction={primaryAction}
          emoji={heroEmoji}
          gameType={game.game_type}
          gameTitle={game.title}
        />
      )}
      {notice}
      <PostJoinSubscribeNudge gameType={game.game_type} />
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
        resultSubtitle={subtitle}
        resultDetail={detail}
        emoji={heroEmoji}
        leaderboard={leaderboard}
      />
    </ScrollView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
