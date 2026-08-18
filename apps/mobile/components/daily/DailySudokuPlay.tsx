/**
 * Daily Sudoku play surface (mobile).
 *
 * Streamlined mobile port of `src/components/daily/DailySudokuPlay.tsx`.
 * Ships its own compact board / number-pad rather than reusing the
 * multiplayer web SudokuBoard, which pulls in player-color / flash-unit
 * machinery irrelevant to the single-player daily challenge.
 *
 * Behavior parity with web: countdown, AsyncStorage-persisted user grid,
 * row/col/box conflict detection, undo, erase, auto-submit on a valid
 * fully-filled grid, auto-submit on timeout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import {
  clearDailyProgress,
  getOrCreateStartedAt,
  loadDailyAnswers,
  saveDailyAnswers,
} from '@/lib/daily-progress'
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: number[][]
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface DraftUndo {
  row: number
  col: number
  prev: number
  prevWrong: boolean
}

const emptyGrid = (): number[][] => Array.from({ length: 9 }, () => Array<number>(9).fill(0))
const emptyBoolGrid = (): boolean[][] => Array.from({ length: 9 }, () => Array<boolean>(9).fill(false))

export function DailySudokuPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [userGrid, setUserGrid] = useState<number[][]>(() => emptyGrid())
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>(() => emptyBoolGrid())
  const [undoStack, setUndoStack] = useState<DraftUndo[]>([])
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [highlightNumber, setHighlightNumber] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<number[][]>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved && Array.isArray(saved) && saved.length === 9) setUserGrid(saved)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers(challengeId, userGrid)
  }, [challengeId, userGrid, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const emptyCells = useMemo(() => puzzle.flat().filter((v) => v === 0).length, [puzzle])
  const filledCells = useMemo(() => {
    let n = 0
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === 0 && userGrid[r][c] !== 0) n++
      }
    }
    return n
  }, [puzzle, userGrid])
  const completionPercent = emptyCells > 0 ? Math.round((filledCells / emptyCells) * 100) : 0
  const allFilled = emptyCells > 0 && filledCells === emptyCells

  const draftWrongCells = useMemo(() => {
    const grid = emptyBoolGrid()
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0 || userGrid[r][c] === 0) continue
        if (wrongDrafts[r][c]) {
          grid[r][c] = true
          continue
        }
        const val = userGrid[r][c]
        let bad = false
        for (let cc = 0; cc < 9 && !bad; cc++) {
          if (cc === c) continue
          const other = puzzle[r][cc] || userGrid[r][cc]
          if (other === val) bad = true
        }
        for (let rr = 0; rr < 9 && !bad; rr++) {
          if (rr === r) continue
          const other = puzzle[rr][c] || userGrid[rr][c]
          if (other === val) bad = true
        }
        const br = Math.floor(r / 3) * 3
        const bc = Math.floor(c / 3) * 3
        for (let rr = br; rr < br + 3 && !bad; rr++) {
          for (let cc = bc; cc < bc + 3 && !bad; cc++) {
            if (rr === r && cc === c) continue
            const other = puzzle[rr][cc] || userGrid[rr][cc]
            if (other === val) bad = true
          }
        }
        grid[r][c] = bad
      }
    }
    return grid
  }, [puzzle, userGrid, wrongDrafts])

  const hasWrongCells = draftWrongCells.some((row) => row.some(Boolean))

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    const cells: Array<{ row: number; col: number; value: number }> = []
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === 0 && userGrid[r][c] !== 0) {
          cells.push({ row: r, col: c, value: userGrid[r][c] })
        }
      }
    }
    onSubmit({ timeSeconds: elapsed, submission: { cells } })
  }, [challengeId, elapsed, onSubmit, puzzle, userGrid])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  useEffect(() => {
    if (!submitted && allFilled && !hasWrongCells) handleSubmit()
  }, [allFilled, hasWrongCells, submitted, handleSubmit])

  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      if (submitted) return
      if (puzzle[row][col] !== 0) {
        setHighlightNumber(puzzle[row][col])
        setSelectedCell(null)
        return
      }
      const v = userGrid[row][col]
      setHighlightNumber(v > 0 ? v : null)
      setSelectedCell([row, col])
    },
    [puzzle, submitted, userGrid]
  )

  const handleNumberPress = useCallback(
    (value: number) => {
      if (!selectedCell || submitted) return
      const [row, col] = selectedCell
      if (puzzle[row][col] !== 0) return

      setUndoStack((prev) => [...prev, { row, col, prev: userGrid[row][col], prevWrong: wrongDrafts[row][col] }])
      setUserGrid((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = value
        return next
      })
      setWrongDrafts((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = false
        return next
      })
      setHighlightNumber(value)
    },
    [puzzle, selectedCell, submitted, userGrid, wrongDrafts]
  )

  const handleErase = useCallback(() => {
    if (!selectedCell || submitted) return
    const [row, col] = selectedCell
    if (puzzle[row][col] !== 0) return
    setUndoStack((prev) => [...prev, { row, col, prev: userGrid[row][col], prevWrong: wrongDrafts[row][col] }])
    setUserGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = 0
      return next
    })
    setWrongDrafts((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = false
      return next
    })
    setHighlightNumber(null)
  }, [puzzle, selectedCell, submitted, userGrid, wrongDrafts])

  const handleUndo = useCallback(() => {
    if (submitted) return
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setUserGrid((grid) => {
        const next = grid.map((r) => [...r])
        next[last.row][last.col] = last.prev
        return next
      })
      setWrongDrafts((wrong) => {
        const next = wrong.map((r) => [...r])
        next[last.row][last.col] = last.prevWrong
        return next
      })
      setSelectedCell([last.row, last.col])
      return prev.slice(0, -1)
    })
  }, [submitted])

  const confirmSubmit = () => {
    Alert.alert(
      'Submit now?',
      "You can't undo this — the leaderboard uses whatever's here right now.",
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: handleSubmit },
      ]
    )
  }

  const timerColor = isTimeUp ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          {completionPercent}% filled
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Fill every row, column, and 3×3 box with 1–9. Tap a cell, then tap a number.
      </Text>

      <View style={styles.boardWrap}>
        <SudokuGrid
          puzzle={puzzle}
          userGrid={userGrid}
          selectedCell={selectedCell}
          onCellSelect={handleCellSelect}
          draftWrongCells={draftWrongCells}
          highlightNumber={highlightNumber}
          disabled={submitted}
        />
      </View>

      <NumberPad
        onNumber={handleNumberPress}
        onErase={handleErase}
        onUndo={handleUndo}
        undoDisabled={undoStack.length === 0}
        disabled={submitted || !selectedCell}
      />

      {allFilled && !submitted ? (
        <AppButton label="Submit puzzle" size="lg" fullWidth onPress={confirmSubmit} />
      ) : null}
    </View>
  )
}

// ── board ────────────────────────────────────────────────────────────────────

function SudokuGrid({
  puzzle,
  userGrid,
  selectedCell,
  onCellSelect,
  draftWrongCells,
  highlightNumber,
  disabled,
}: {
  puzzle: number[][]
  userGrid: number[][]
  selectedCell: [number, number] | null
  onCellSelect: (row: number, col: number) => void
  draftWrongCells: boolean[][]
  highlightNumber: number | null
  disabled: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  return (
    <View style={styles.grid}>
      {puzzle.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((_, c) => {
            const given = puzzle[r][c] !== 0
            const value = given ? puzzle[r][c] : userGrid[r][c]
            const isSelected = selectedCell?.[0] === r && selectedCell?.[1] === c
            const wrong = draftWrongCells[r][c]
            const sameNumberHi = highlightNumber != null && value === highlightNumber && value > 0
            const rowHi = selectedCell?.[0] === r
            const colHi = selectedCell?.[1] === c

            const borderRightHeavy = (c + 1) % 3 === 0 && c < 8
            const borderBottomHeavy = (r + 1) % 3 === 0 && r < 8

            const bg = isSelected
              ? theme.borderAccent
              : sameNumberHi
                ? theme.borderAccent
                : rowHi || colHi
                  ? theme.surfaceHover
                  : theme.bg

            const color = wrong ? theme.error : given ? theme.text : theme.primary

            return (
              <Pressable
                key={c}
                onPress={() => onCellSelect(r, c)}
                disabled={disabled}
                style={[
                  styles.cell,
                  {
                    backgroundColor: bg,
                    borderColor: theme.border,
                    borderRightWidth: borderRightHeavy ? 2 : StyleSheet.hairlineWidth,
                    borderBottomWidth: borderBottomHeavy ? 2 : StyleSheet.hairlineWidth,
                    borderRightColor: borderRightHeavy ? theme.textMuted : theme.border,
                    borderBottomColor: borderBottomHeavy ? theme.textMuted : theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.cellText, { color, fontWeight: given ? '800' : '600' }]}
                >
                  {value > 0 ? String(value) : ''}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function NumberPad({
  onNumber,
  onErase,
  onUndo,
  undoDisabled,
  disabled,
}: {
  onNumber: (n: number) => void
  onErase: () => void
  onUndo: () => void
  undoDisabled: boolean
  disabled: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  return (
    <View style={styles.padWrap}>
      <View style={styles.padRow}>
        {numbers.map((n) => (
          <Pressable
            key={n}
            onPress={() => onNumber(n)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.padKey,
              {
                backgroundColor: pressed && !disabled ? theme.borderAccent : theme.surface,
                borderColor: theme.border,
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            <Text style={styles.padKeyText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.padActions}>
        <AppButton label="Undo" tone="secondary" size="sm" onPress={onUndo} disabled={undoDisabled || disabled} />
        <AppButton label="Erase" tone="ghost" size="sm" onPress={onErase} disabled={disabled} />
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    timerLabel: { color: theme.textMuted, fontSize: theme.type.body.size, fontWeight: '700' },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    boardWrap: { alignItems: 'center' },
    grid: {
      aspectRatio: 1,
      width: '100%',
      maxWidth: 400,
      borderWidth: 2,
      borderColor: theme.textMuted,
      borderRadius: 4,
      overflow: 'hidden',
    },
    gridRow: { flex: 1, flexDirection: 'row' },
    cell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      borderLeftColor: theme.border,
    },
    cellText: { fontSize: 20, fontVariant: ['tabular-nums'] },
    padWrap: { gap: 10 },
    padRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    padKey: {
      flex: 1,
      aspectRatio: 1,
      maxWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1,
    },
    padKeyText: { color: theme.text, fontSize: 20, fontWeight: '700' },
    padActions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  })
