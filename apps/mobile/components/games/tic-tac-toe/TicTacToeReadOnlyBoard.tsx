import { StyleSheet, Text, View } from 'react-native'
import { checkOverallWinner, subBoardCells } from '@fateround/shared/tic-tac-toe'
import type { TicTacToeBoardResult, TicTacToeMark } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

function markGlyph(value: TicTacToeMark | null): string {
  return value === 'X' ? '✕' : value === 'O' ? '○' : ''
}

/**
 * Compact non-interactive meta-board used on the finished screen so players can
 * review the final position (mirrors web's ReadOnlyBoard in the share block).
 * The winning meta-line sub-boards are highlighted amber.
 */
export function TicTacToeReadOnlyBoard({
  board,
  boardWinners,
}: {
  board: (TicTacToeMark | null)[]
  boardWinners: TicTacToeBoardResult[]
}) {
  const styles = useThemedStyles(makeStyles)
  const win = checkOverallWinner(boardWinners ?? [])
  const winLine = new Set(win?.line ?? [])

  return (
    <View style={styles.grid}>
      {Array.from({ length: 9 }, (_, boardIndex) => {
        const result: TicTacToeBoardResult = boardWinners[boardIndex] ?? null
        const decided = result != null
        return (
          <View key={boardIndex} style={[styles.subBoard, winLine.has(boardIndex) && styles.subBoardWin]}>
            <View style={styles.cellGrid}>
              {subBoardCells(board, boardIndex).map((cell, pos) => (
                <View key={pos} style={styles.cell}>
                  <Text
                    style={[
                      styles.cellMark,
                      decided && styles.cellDim,
                      cell === 'X' ? styles.markX : cell === 'O' ? styles.markO : null,
                    ]}
                  >
                    {markGlyph(cell)}
                  </Text>
                </View>
              ))}
            </View>
            {decided ? (
              <View style={styles.overlay} pointerEvents="none">
                {result === 'draw' ? (
                  <Text style={styles.overlayDraw}>🤝</Text>
                ) : (
                  <Text style={[styles.overlayMark, result === 'X' ? styles.markX : styles.markO]}>
                    {markGlyph(result)}
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      justifyContent: 'center',
      alignSelf: 'center',
      maxWidth: 260,
    },
    subBoard: {
      width: '31%',
      aspectRatio: 1,
      backgroundColor: theme.surface,
      borderRadius: 8,
      padding: 3,
      borderWidth: 2,
      borderColor: theme.border,
    },
    subBoardWin: { borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.15)' },
    cellGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
    cell: {
      width: '31%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellMark: { fontSize: 10, fontWeight: '900', color: theme.text },
    cellDim: { opacity: 0.3 },
    markX: { color: '#38bdf8' },
    markO: { color: '#fb923c' },
    overlay: {
      position: 'absolute',
      top: 3,
      left: 3,
      right: 3,
      bottom: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlayMark: { fontSize: 26, fontWeight: '900' },
    overlayDraw: { fontSize: 18 },
  })
