'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { CrosswordBoard } from '@/components/crossword/CrosswordBoard'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { hashWord } from '@/lib/daily-word-hash'
import type { CrosswordMetadata } from '@/lib/crossword'

interface DailyCrosswordPlayProps {
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyCrosswordPlay({ puzzle, timer: maxSeconds, onSubmit }: DailyCrosswordPlayProps) {
  const metadata = puzzle.metadata as CrosswordMetadata
  const size = metadata.size

  const [letterGrid, setLetterGrid] = useState<string[][]>(() =>
    Array.from({ length: size }, () => Array(size).fill(''))
  )
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [direction, setDirection] = useState<'across' | 'down'>('across')
  const [submitted, setSubmitted] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const submitRef = useRef(false)

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
  })

  // Count fillable cells and filled cells
  const fillableCount = useMemo(() => {
    let count = 0
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!metadata.blocked[r][c]) count++
      }
    }
    return count
  }, [metadata, size])

  const filledCount = useMemo(() => {
    let count = 0
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!metadata.blocked[r][c] && letterGrid[r][c]) count++
      }
    }
    return count
  }, [metadata, letterGrid, size])

  const allFilled = fillableCount > 0 && filledCount >= fillableCount

  // Live correctness via per-clue answer hashes (no solution ever reaches the client). A word is
  // "solved" when every cell is filled and the hash of the entry matches its clue's answer hash.
  const answerHashes = (puzzle.answer_hashes as string[] | undefined) ?? []
  const clues = useMemo(() => metadata.clues ?? [], [metadata.clues])
  const { solvedCells, solvedClues, solvedCount } = useMemo(() => {
    const cellsGrid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
    const solved = new Set<number>()
    clues.forEach((clue, i) => {
      const hash = answerHashes[i]
      if (!hash) return
      let word = ''
      const cells: [number, number][] = []
      for (let k = 0; k < clue.length; k++) {
        const r = clue.direction === 'across' ? clue.row : clue.row + k
        const c = clue.direction === 'across' ? clue.col + k : clue.col
        cells.push([r, c])
        word += letterGrid[r]?.[c] ?? ''
      }
      if (word.length === clue.length && hashWord(word) === hash) {
        solved.add(i)
        for (const [r, c] of cells) cellsGrid[r][c] = true
      }
    })
    return { solvedCells: cellsGrid, solvedClues: solved, solvedCount: solved.size }
  }, [clues, answerHashes, letterGrid, size])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)

    const cells: Array<{ row: number; col: number; letter: string }> = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!metadata.blocked[r][c] && letterGrid[r][c]) {
          cells.push({ row: r, col: c, letter: letterGrid[r][c] })
        }
      }
    }

    onSubmit({
      timeSeconds: elapsed,
      submission: { cells, hintsUsed },
    })
  }, [metadata, letterGrid, size, elapsed, hintsUsed, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      if (submitted || metadata.blocked[row][col]) return
      if (selectedCell && selectedCell[0] === row && selectedCell[1] === col) {
        setDirection((d) => (d === 'across' ? 'down' : 'across'))
      } else {
        setSelectedCell([row, col])
      }
    },
    [selectedCell, submitted, metadata]
  )

  // Active cells highlight for current word
  const activeCells = useMemo(() => {
    if (!selectedCell) return new Set<string>()
    const [sr, sc] = selectedCell
    const cells = new Set<string>()

    if (direction === 'across') {
      let c = sc
      while (c > 0 && !metadata.blocked[sr][c - 1]) c--
      while (c < size && !metadata.blocked[sr][c]) {
        cells.add(`${sr},${c}`)
        c++
      }
    } else {
      let r = sr
      while (r > 0 && !metadata.blocked[r - 1][sc]) r--
      while (r < size && !metadata.blocked[r][sc]) {
        cells.add(`${r},${sc}`)
        r++
      }
    }

    return cells
  }, [selectedCell, direction, metadata, size])

  // Shared letter-entry actions, used by both the physical keyboard and the on-screen keyboard
  // (the latter is the only way to type on touch devices, which have no hardware keys).
  const enterLetter = useCallback(
    (raw: string) => {
      if (submitted || !selectedCell) return
      const letter = raw.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      const [row, col] = selectedCell
      setLetterGrid((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = letter
        return next
      })
      const dr = direction === 'down' ? 1 : 0
      const dc = direction === 'across' ? 1 : 0
      const nr = row + dr
      const nc = col + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) setSelectedCell([nr, nc])
    },
    [submitted, selectedCell, direction, size, metadata]
  )

  const deleteLetter = useCallback(() => {
    if (submitted || !selectedCell) return
    const [row, col] = selectedCell
    setLetterGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = ''
      return next
    })
    const dr = direction === 'down' ? -1 : 0
    const dc = direction === 'across' ? -1 : 0
    const nr = row + dr
    const nc = col + dc
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) setSelectedCell([nr, nc])
  }, [submitted, selectedCell, direction, size, metadata])

  // Physical keyboard input (desktop). Touch devices use the on-screen keyboard below.
  useEffect(() => {
    if (submitted || !selectedCell) return

    const handler = (e: KeyboardEvent) => {
      const [row, col] = selectedCell

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteLetter()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDirection('down')
        if (row > 0 && !metadata.blocked[row - 1][col]) setSelectedCell([row - 1, col])
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setDirection('down')
        if (row < size - 1 && !metadata.blocked[row + 1][col]) setSelectedCell([row + 1, col])
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setDirection('across')
        if (col > 0 && !metadata.blocked[row][col - 1]) setSelectedCell([row, col - 1])
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setDirection('across')
        if (col < size - 1 && !metadata.blocked[row][col + 1]) setSelectedCell([row, col + 1])
        return
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault()
        enterLetter(e.key)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedCell, direction, submitted, metadata, size, enterLetter, deleteLetter])

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div className="flex items-center justify-between rounded-lg bg-base-200 px-4 py-2">
        <div>
          <span className="text-sm font-medium text-base-content/60">Solved: </span>
          <span className="font-bold">
            {solvedCount}/{clues.length}
          </span>
        </div>
        <span className={`font-mono text-lg font-bold ${isTimeUp ? 'text-error' : ''}`}>{formatted}</span>
      </div>

      {/* Board — correct words are filled in the solved colour */}
      <CrosswordBoard
        metadata={metadata}
        letterGrid={letterGrid}
        mySolvedCells={solvedCells}
        selectedCell={selectedCell}
        activeCells={activeCells}
        onCellSelect={handleCellSelect}
        readOnly={submitted || isTimeUp}
      />

      {/* On-screen keyboard — the only way to type on touch devices (no hardware keys). */}
      {!submitted && !isTimeUp && (
        <div className="mx-auto w-full max-w-[min(460px,100%)] select-none space-y-1.5">
          {['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((rowKeys, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {ri === 2 && (
                <button
                  type="button"
                  aria-label="Backspace"
                  onClick={deleteLetter}
                  className="flex h-11 flex-[1.5] items-center justify-center rounded-md bg-base-300 text-base font-semibold active:scale-95"
                >
                  ⌫
                </button>
              )}
              {rowKeys.split('').map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => enterLetter(ch)}
                  className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-md bg-base-200 text-base font-semibold active:scale-95"
                >
                  {ch}
                </button>
              ))}
              {ri === 2 && <div className="flex-[1.5]" aria-hidden />}
            </div>
          ))}
        </div>
      )}

      {/* Clues */}
      <div className="rounded-lg bg-base-200 p-3 max-h-48 overflow-y-auto">
        <div className="text-sm font-medium text-base-content/60 mb-2">Clues</div>
        <div className="space-y-1 text-sm">
          {clues.map((clue, i) => {
            const solved = solvedClues.has(i)
            return (
              <div key={i} className={`flex gap-2 ${solved ? 'text-success line-through' : ''}`}>
                <span className="font-bold text-base-content/50 w-8 shrink-0">
                  {clue.number}
                  {clue.direction === 'across' ? 'A' : 'D'}
                </span>
                <span>{clue.clue}</span>
                {solved && <span className="ml-auto shrink-0">✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {allFilled && !submitted && (
        <div className="text-center">
          <button className="btn btn-primary btn-lg" onClick={handleSubmit}>
            Submit Crossword
          </button>
        </div>
      )}
    </div>
  )
}
