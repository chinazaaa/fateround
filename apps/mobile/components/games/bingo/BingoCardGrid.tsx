import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { BINGO_COLUMNS, BINGO_DISPLAY_ORDER, BINGO_FREE_INDEX } from '@fateround/shared/bingo'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

const GRID_MAX_WIDTH = 320
const CELL_GAP = 6

type Props = {
  cells: number[]
  markedIndices: number[]
  calledNumbers: Set<number>
  marking?: boolean
  /** Read-only mode: cells reflect marks/called state but can't be tapped (finished recap). */
  disabled?: boolean
  onMark: (cellIndex: number) => void
}

export function BingoCardGrid({
  cells,
  markedIndices,
  calledNumbers,
  marking = false,
  disabled = false,
  onMark,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { width: screenWidth } = useWindowDimensions()
  const gridWidth = Math.min(screenWidth - theme.space.lg * 2, GRID_MAX_WIDTH)
  const cellSize = (gridWidth - CELL_GAP * 4) / 5
  const marked = new Set(markedIndices)

  return (
    <View style={[styles.wrap, { width: gridWidth }]}>
      <View style={[styles.headerRow, { gap: CELL_GAP }]}>
        {BINGO_COLUMNS.map((letter) => (
          <View key={letter} style={{ width: cellSize, alignItems: 'center' }}>
            <Text style={styles.headerLetter}>{letter}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: CELL_GAP }}>
        {Array.from({ length: 5 }, (_, row) => (
          <View key={row} style={[styles.row, { gap: CELL_GAP }]}>
            {BINGO_DISPLAY_ORDER.slice(row * 5, row * 5 + 5).map((cellIndex) => {
              const number = cells[cellIndex]
              const isFree = cellIndex === BINGO_FREE_INDEX
              const isMarked = marked.has(cellIndex) || isFree
              const isCallable = isFree || calledNumbers.has(number)
              const canMark = isCallable && !isMarked && !marking && !disabled

              return (
                <Pressable
                  key={cellIndex}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    isFree && styles.cellFree,
                    isMarked && styles.cellMarked,
                    isCallable && !isMarked && styles.cellCallable,
                  ]}
                  disabled={!canMark}
                  onPress={() => onMark(cellIndex)}
                >
                  <Text style={[styles.cellText, isFree && styles.cellTextFree]}>
                    {isFree ? 'FREE' : number}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    gap: CELL_GAP,
  },
  headerRow: {
    flexDirection: 'row',
  },
  headerLetter: {
    color: theme.primary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  cellFree: {
    backgroundColor: '#422006',
    borderColor: '#f59e0b',
  },
  cellCallable: {
    borderColor: '#3b82f6',
    backgroundColor: '#172554',
  },
  cellMarked: {
    backgroundColor: '#14532d',
    borderColor: '#22c55e',
  },
  cellText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  cellTextFree: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fcd34d',
  },
})
