import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { BINGO_COLUMNS, formatBingoNumber } from '@fateround/shared/bingo'
import type { Theme } from '@/constants/theme'
import { useThemedStyles, useTheme } from '@/constants/theme-context'

const BOARD_MAX_WIDTH = 340
const COL_GAP = 6

// Column number ranges: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75.
const COLUMN_RANGES: [number, number][] = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
]

type Props = {
  calledNumbers: Set<number>
  lastCalled?: number | null
}

/**
 * Read-only B-I-N-G-O board showing all 75 numbers, called ones highlighted.
 * Used as the viewer/spectator surface (in place of a personal card) and as an
 * always-available reference. Mirrors web CalledNumbersBoard.
 */
export function CalledNumbersBoard({ calledNumbers, lastCalled }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { width: screenWidth } = useWindowDimensions()
  const boardWidth = Math.min(screenWidth - theme.space.lg * 2, BOARD_MAX_WIDTH)

  return (
    <View style={[styles.wrap, { width: boardWidth }]}>
      {lastCalled != null ? (
        <View style={styles.latest}>
          <Text style={styles.latestLabel}>Latest call</Text>
          <Text style={styles.latestNumber}>{formatBingoNumber(lastCalled)}</Text>
        </View>
      ) : null}
      <View style={[styles.columns, { gap: COL_GAP }]}>
        {BINGO_COLUMNS.map((letter, colIndex) => {
          const [min, max] = COLUMN_RANGES[colIndex]!
          const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
          return (
            <View key={letter} style={styles.column}>
              <Text style={styles.columnLetter}>{letter}</Text>
              {nums.map((n) => {
                const isCalled = calledNumbers.has(n)
                return (
                  <View key={n} style={[styles.numCell, isCalled && styles.numCellCalled]}>
                    <Text style={[styles.numText, isCalled && styles.numTextCalled]}>{n}</Text>
                  </View>
                )
              })}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'center', gap: 10 },
    latest: { alignItems: 'center', gap: 2 },
    latestLabel: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    latestNumber: { color: '#60a5fa', fontSize: 28, fontWeight: '900' },
    columns: { flexDirection: 'row' },
    column: { flex: 1, gap: 4 },
    columnLetter: {
      color: '#60a5fa',
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 2,
    },
    numCell: {
      borderRadius: 5,
      paddingVertical: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    // Called cells use a fixed blue wash that reads in both schemes — intentional.
    numCellCalled: { backgroundColor: '#1d4ed8' },
    numText: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    numTextCalled: { color: '#eff6ff', fontWeight: '800' },
  })
