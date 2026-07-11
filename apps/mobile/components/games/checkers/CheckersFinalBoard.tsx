import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colorOfPiece, isDarkSquare, pieceAt, squareId } from '@fateround/shared/checkers'
import type { CheckersSession, Player } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { checkersResultDetail } from '@/components/games/checkers/checkers-clocks'

const RC = [0, 1, 2, 3, 4, 5, 6, 7] as const

/**
 * Read-only snapshot of the final board position, mirroring the web
 * CheckersFinalResultsShareBlock. Rendered under the standings on the finish
 * screen so the winning position (and the matchup) is part of the results card.
 */
export function CheckersFinalBoard({
  session,
  players,
  highlightPlayerId,
}: {
  session: CheckersSession
  players: Player[]
  highlightPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const { width } = useWindowDimensions()
  const squareSize = Math.min(Math.floor((width - 96) / 8), 32)
  const board = session.board

  const red = players.find((p) => p.id === session.player_red_id)
  const black = players.find((p) => p.id === session.player_black_id)
  const redName = red?.name ?? 'Red'
  const blackName = black?.name ?? 'Black'
  const detail = checkersResultDetail(session.result_reason)

  return (
    <View style={styles.card}>
      <View style={styles.matchup}>
        <Text style={styles.side} numberOfLines={1}>
          🔴 {redName}
          {red?.id === highlightPlayerId ? ' (you)' : ''}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.side, styles.sideRight]} numberOfLines={1}>
          ⚫ {blackName}
          {black?.id === highlightPlayerId ? ' (you)' : ''}
        </Text>
      </View>

      <View style={[styles.board, { width: squareSize * 8 }]}>
        {RC.map((row) => (
          <View key={row} style={styles.row}>
            {RC.map((col) => {
              const dark = isDarkSquare(row, col)
              const piece = dark ? pieceAt(board, row, col) : '.'
              const color = colorOfPiece(piece)
              const king = piece === 'R' || piece === 'B'
              return (
                <View
                  key={squareId(row, col)}
                  style={[
                    styles.square,
                    { width: squareSize, height: squareSize },
                    dark ? styles.darkSquare : styles.lightSquare,
                  ]}
                >
                  {color ? (
                    <View style={[styles.disc, color === 'r' ? styles.redDisc : styles.blackDisc]}>
                      {king ? <Text style={styles.crown}>♔</Text> : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        ))}
      </View>

      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    matchup: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      gap: 8,
    },
    side: { flex: 1, color: theme.text, fontWeight: '700', fontSize: 13 },
    sideRight: { textAlign: 'right' },
    vs: { color: theme.textFaint, fontSize: 12, fontWeight: '600' },
    board: {
      flexDirection: 'column',
      borderWidth: 2,
      borderColor: '#2a2a35',
      borderRadius: 8,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row' },
    square: { alignItems: 'center', justifyContent: 'center' },
    lightSquare: { backgroundColor: '#f5e6c8' },
    darkSquare: { backgroundColor: '#8b5e34' },
    disc: {
      width: '72%',
      height: '72%',
      borderRadius: 999,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    redDisc: { backgroundColor: '#dc2626' },
    blackDisc: { backgroundColor: '#111827' },
    crown: { color: '#fcd34d', fontSize: 11, fontWeight: '800', marginTop: -2 },
    detail: { color: theme.textMuted, fontSize: 12, textTransform: 'capitalize' },
  })
