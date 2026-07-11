import { StyleSheet, Text, View } from 'react-native'
import type { Player, TicTacToeSession } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { TicTacToeReadOnlyBoard } from './TicTacToeReadOnlyBoard'

/**
 * Finished-screen recap: the ✕ vs ○ player line (with a "(you)" marker on the
 * local player) above the final read-only meta-board. Mirrors web's
 * TicTacToeFinalResultsShareBlock body so players can review the finished game.
 */
export function TicTacToeFinalBoardRecap({
  session,
  players,
  myPlayerId,
}: {
  session: TicTacToeSession
  players: Player[]
  myPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const playerX = players.find((p) => p.id === session.player_x_id)
  const playerO = players.find((p) => p.id === session.player_o_id)

  return (
    <View style={styles.card}>
      <View style={styles.playerLine}>
        <Text style={[styles.side, styles.sideX]} numberOfLines={1}>
          ✕ {playerX?.name ?? 'Player 1'}
          {playerX?.id === myPlayerId ? ' (you)' : ''}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.side, styles.sideO, styles.sideRight]} numberOfLines={1}>
          ○ {playerO?.name ?? 'Player 2'}
          {playerO?.id === myPlayerId ? ' (you)' : ''}
        </Text>
      </View>
      <TicTacToeReadOnlyBoard board={session.board} boardWinners={session.board_winners ?? []} />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    playerLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    side: { flex: 1, fontSize: 13, fontWeight: '700' },
    sideRight: { textAlign: 'right' },
    sideX: { color: '#38bdf8' },
    sideO: { color: '#fb923c' },
    vs: { color: theme.textFaint, fontSize: 12, fontWeight: '600' },
  })
