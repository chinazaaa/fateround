import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { CrosswordMetadata } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { CROSSWORD_MY_CELL_COLOR, crosswordPlayerColor } from '@/components/games/crossword/standings'

const cellKey = (row: number, col: number) => `${row}-${col}`

/** Board fits inside this width; cell size scales down for bigger grids. */
const BOARD_MAX_WIDTH = 340

type Props = {
  metadata: CrosswordMetadata
  /** Letters to render per cell ('' = empty). */
  letterGrid: string[][]
  /** First correct solver per cell, for ownership colouring. */
  cellOwners?: (string | null)[][]
  /** Cells this player has correctly solved (get the stronger own-colour fill). */
  mySolvedCells?: boolean[][]
  playerColors?: Record<string, string>
  myPlayerId?: string | null
  selectedCell?: [number, number] | null
  /** Cells belonging to the active across/down word, softly highlighted. */
  activeCells?: Set<string>
  /** Cells currently holding an incorrect local guess (rendered red). */
  wrongCells?: boolean[][]
  onCellSelect?: (row: number, col: number) => void
  readOnly?: boolean
}

/** Hex colour + two-digit alpha suffix (e.g. '#6366f1' + '33'). */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

export function CrosswordBoardView({
  metadata,
  letterGrid,
  cellOwners,
  mySolvedCells,
  playerColors = {},
  myPlayerId,
  selectedCell,
  activeCells,
  wrongCells,
  onCellSelect,
  readOnly = false,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const size = metadata.size
  const cell = Math.floor(BOARD_MAX_WIDTH / size)
  const numberFont = size > 11 ? 6 : 8
  const letterFont = size > 11 ? Math.max(11, cell - 12) : Math.max(14, cell - 14)

  return (
    <View style={styles.board}>
      {Array.from({ length: size }, (_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: size }, (_, col) => {
            const blocked = !!metadata.blocked[row]?.[col]
            if (blocked) {
              return <View key={cellKey(row, col)} style={[styles.cell, styles.cellBlocked, { width: cell, height: cell }]} />
            }

            const number = metadata.numbers?.[row]?.[col] ?? 0
            const letter = letterGrid[row]?.[col] ?? ''
            const iSolved = !!mySolvedCells?.[row]?.[col]
            const owner = cellOwners?.[row]?.[col] ?? null
            const isWrong = !!wrongCells?.[row]?.[col]
            const isSelected = selectedCell?.[0] === row && selectedCell?.[1] === col
            const isActive = activeCells?.has(cellKey(row, col)) ?? false

            // A player's board (mySolvedCells supplied) shows ONLY their own solved cells —
            // everyone races their own copy. The host watch board (no mySolvedCells) shows
            // every player's progress by owner colour.
            const baseBg = mySolvedCells
              ? iSolved
                ? withAlpha(CROSSWORD_MY_CELL_COLOR, '55')
                : undefined
              : owner
                ? withAlpha(owner === myPlayerId ? CROSSWORD_MY_CELL_COLOR : (playerColors[owner] ?? crosswordPlayerColor(0)), '55')
                : undefined
            // Solved cells keep their fill even inside the active word (selected cell still
            // shows its ring), so a word turns colour the instant it's correct.
            const bg =
              mySolvedCells && iSolved
                ? withAlpha(CROSSWORD_MY_CELL_COLOR, '55')
                : isSelected
                  ? 'rgba(99,102,241,0.35)'
                  : isActive
                    ? 'rgba(99,102,241,0.14)'
                    : baseBg

            return (
              <Pressable
                key={cellKey(row, col)}
                style={[
                  styles.cell,
                  { width: cell, height: cell },
                  bg ? { backgroundColor: bg } : null,
                  isSelected && styles.cellSelected,
                ]}
                disabled={readOnly}
                onPress={() => onCellSelect?.(row, col)}
              >
                {number > 0 ? <Text style={[styles.number, { fontSize: numberFont }]}>{number}</Text> : null}
                <Text style={[styles.letter, { fontSize: letterFont }, isWrong && styles.letterWrong]}>
                  {letter ? letter.toUpperCase() : ''}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Functional puzzle board — frame + cell state colors kept fixed across themes,
    // matching the Sudoku board treatment.
    board: { alignSelf: 'center', borderWidth: 2, borderColor: '#64748b', borderRadius: 2, overflow: 'hidden' },
    row: { flexDirection: 'row' },
    cell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(100,116,139,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    cellBlocked: { backgroundColor: '#1e293b' },
    cellSelected: { borderWidth: 2, borderColor: '#6366f1' },
    number: {
      position: 'absolute',
      top: 1,
      left: 2,
      color: theme.textMuted,
      fontWeight: '700',
      lineHeight: 8,
    },
    letter: { color: theme.text, fontWeight: '800' },
    letterWrong: { color: '#ef4444' },
  })
