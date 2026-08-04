'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { SudokuBoard } from '@/components/sudoku/SudokuBoard'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

interface DailySudokuPlayProps {
  challengeId: string
  puzzle: number[][]
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

type DraftUndo = { row: number; col: number; prev: number; prevWrong: boolean }

function makeEmptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0))
}

function makeEmptyBoolGrid(): boolean[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(false))
}

export function DailySudokuPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailySudokuPlayProps) {
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [userGrid, setUserGrid] = useState<number[][]>(
    () => loadDailyAnswers<number[][]>(challengeId) ?? makeEmptyGrid()
  )
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>(makeEmptyBoolGrid)
  const [undoStack, setUndoStack] = useState<DraftUndo[]>([])
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [highlightNumber, setHighlightNumber] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, userGrid)
  }, [challengeId, userGrid, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  // Count filled cells for completion percent
  const emptyCells = puzzle.flat().filter((v) => v === 0).length
  const filledCells = userGrid.flat().filter((v, i) => {
    const row = Math.floor(i / 9)
    const col = i % 9
    return puzzle[row][col] === 0 && v !== 0
  }).length
  const completionPercent = emptyCells > 0 ? Math.round((filledCells / emptyCells) * 100) : 0

  // Check if all cells are filled
  const allFilled = emptyCells > 0 && filledCells === emptyCells

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)

    const cells: Array<{ row: number; col: number; value: number }> = []
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === 0 && userGrid[r][c] !== 0) {
          cells.push({ row: r, col: c, value: userGrid[r][c] })
        }
      }
    }

    onSubmit({
      timeSeconds: elapsed,
      submission: { cells },
    })
  }, [puzzle, userGrid, elapsed, onSubmit, challengeId])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmit()
  }, [confirm, handleSubmit])

  // Auto-submit on time up
  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      if (submitted) return
      if (puzzle[row][col] !== 0) {
        setHighlightNumber(puzzle[row][col])
        setSelectedCell(null)
        return
      }
      setHighlightNumber(null)
      setSelectedCell([row, col])
    },
    [puzzle, submitted]
  )

  const handleNumberPress = useCallback(
    (value: number) => {
      if (!selectedCell || submitted) return
      const [row, col] = selectedCell
      if (puzzle[row][col] !== 0) return

      // Push undo
      setUndoStack((prev) => [...prev, { row, col, prev: userGrid[row][col], prevWrong: wrongDrafts[row][col] }])

      // Update grid
      setUserGrid((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = value
        return next
      })

      // Clear wrong status
      setWrongDrafts((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = false
        return next
      })
    },
    [selectedCell, puzzle, userGrid, wrongDrafts, submitted]
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
  }, [selectedCell, puzzle, userGrid, wrongDrafts, submitted])

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

  // Physical keyboard input: 1–9 enters a number into the selected cell, Backspace/Delete/0 erases.
  useEffect(() => {
    if (submitted) return
    const handler = (e: KeyboardEvent) => {
      if (!selectedCell) return
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        handleNumberPress(Number(e.key))
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault()
        handleErase()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedCell, submitted, handleNumberPress, handleErase])

  // Basic Sudoku rule violation detection (duplicates in row/col/block)
  const draftWrongCells = (() => {
    const grid = makeEmptyBoolGrid()
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0 || userGrid[r][c] === 0) continue
        if (wrongDrafts[r][c]) {
          grid[r][c] = true
          continue
        }
        const val = userGrid[r][c]
        // Check row duplicate
        for (let cc = 0; cc < 9; cc++) {
          if (cc === c) continue
          const other = puzzle[r][cc] || userGrid[r][cc]
          if (other === val) {
            grid[r][c] = true
            break
          }
        }
        if (grid[r][c]) continue
        // Check col duplicate
        for (let rr = 0; rr < 9; rr++) {
          if (rr === r) continue
          const other = puzzle[rr][c] || userGrid[rr][c]
          if (other === val) {
            grid[r][c] = true
            break
          }
        }
        if (grid[r][c]) continue
        // Check block duplicate
        const br = Math.floor(r / 3) * 3
        const bc = Math.floor(c / 3) * 3
        for (let rr = br; rr < br + 3; rr++) {
          for (let cc = bc; cc < bc + 3; cc++) {
            if (rr === r && cc === c) continue
            const other = puzzle[rr][cc] || userGrid[rr][cc]
            if (other === val) {
              grid[r][c] = true
              break
            }
          }
          if (grid[r][c]) break
        }
      }
    }
    return grid
  })()

  // Merge puzzle + user grid for display
  const displayGrid = puzzle.map((row, r) => row.map((val, c) => (val !== 0 ? val : userGrid[r][c])))

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Time remaining</span>
        <span
          className={`font-mono font-bold ${isTimeUp ? 'text-error' : ''}`}
          style={{ fontSize: 'var(--text-lg)', fontFeatureSettings: '"tnum"' }}
        >
          {formatted}
        </span>
      </div>

      <SudokuBoard
        puzzle={puzzle}
        userGrid={displayGrid}
        selectedCell={selectedCell}
        onCellSelect={handleCellSelect}
        onNumberPress={handleNumberPress}
        onErase={handleErase}
        onUndo={handleUndo}
        undoDisabled={undoStack.length === 0}
        draftWrongCells={draftWrongCells}
        completionPercent={completionPercent}
        readOnly={submitted}
        highlightNumber={highlightNumber}
      />

      {/* Submit button */}
      {allFilled && !submitted && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary fr-btn--lg" onClick={confirmAndSubmit}>
            Submit Puzzle
          </button>
        </div>
      )}
    </div>
  )
}
