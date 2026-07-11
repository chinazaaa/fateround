import { View, StyleSheet } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import {
  GameFinishedScreen,
  type FinishedLeaderboardRow,
} from '@/components/game/GameChrome'
import { PlayAgainFooter } from '@/components/lifecycle/PlayAgainFooter'
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
}: Props) {
  const game = bootstrap.game
  if (!game) return null

  return (
    <View style={styles.wrap}>
      <GameFinishedScreen
        title={title}
        detail={detail}
        subtitle={subtitle}
        leaderboard={leaderboard}
        primaryAction={primaryAction}
        emoji={emoji}
      />
      {showPlayAgain ? (
        <PlayAgainFooter gameCode={bootstrap.code} game={game} onReplayReady={bootstrap.load} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
})
