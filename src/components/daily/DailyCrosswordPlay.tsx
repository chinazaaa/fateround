'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { CrosswordBoard } from '@/components/crossword/CrosswordBoard'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { hashWord } from '@/lib/daily-word-hash'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'
import type { CrosswordMetadata } from '@/lib/crossword'

interface DailyCrosswordPlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyCrosswordPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyCrosswordPlayProps) {
  const metadata = puzzle.metadata as CrosswordMetadata
  const size = metadata.size

  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [letterGrid, setLetterGrid] = useState<string[][]>(
    () => loadDailyAnswers<string[][]>(challengeId) ?? Array.from({ length: size }, () => Array(size).fill(''))
  )
  const [selectedCell, _setSelectedCell] = useState<[number, number] | null>(null)
  const selectedCellRef = useRef<[number, number] | null>(null)
  const setSelectedCell = useCallback((cell: [number, number] | null) => {
    selectedCellRef.current = cell
    _setSelectedCell(cell)
  }, [])
  const [direction, _setDirection] = useState<'across' | 'down'>('across')
  const directionRef = useRef<'across' | 'down'>('across')
  const setDirection = useCallback((d: 'across' | 'down' | ((prev: 'across' | 'down') => 'across' | 'down')) => {
    if (typeof d === 'function') {
      const next = d(directionRef.current)
      directionRef.current = next
      _setDirection(next)
    } else {
      directionRef.current = d
      _setDirection(d)
    }
  }, [])
  const [submitted, setSubmitted] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  // Persist the grid so leaving and returning restores progress (timer keeps running via startAtMs).
  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, letterGrid)
  }, [challengeId, letterGrid, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
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

  const solvedCellsRef = useRef(solvedCells)
  useLayoutEffect(() => {
    solvedCellsRef.current = solvedCells
  }, [solvedCells])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)

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
  }, [metadata, letterGrid, size, elapsed, hintsUsed, onSubmit, challengeId])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmit()
  }, [confirm, handleSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  // Auto-submit the moment every word is correct — no need to also click Submit.
  useEffect(() => {
    if (!submitted && clues.length > 0 && solvedCount === clues.length) handleSubmit()
  }, [solvedCount, clues.length, submitted, handleSubmit])

  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      if (submitted || metadata.blocked[row][col]) return
      const cur = selectedCellRef.current
      if (cur && cur[0] === row && cur[1] === col) {
        setDirection((d) => (d === 'across' ? 'down' : 'across'))
        return
      }

      const hasAcross =
        (col > 0 && !metadata.blocked[row][col - 1]) || (col < size - 1 && !metadata.blocked[row][col + 1])
      const hasDown =
        (row > 0 && !metadata.blocked[row - 1][col]) || (row < size - 1 && !metadata.blocked[row + 1][col])
      if (hasAcross && !hasDown) setDirection('across')
      else if (hasDown && !hasAcross) setDirection('down')

      // If the tapped cell is already solved, advance to the next editable cell.
      if (solvedCellsRef.current[row]?.[col]) {
        const dir = directionRef.current
        const dr = dir === 'down' ? 1 : 0
        const dc = dir === 'across' ? 1 : 0
        let r = row + dr
        let c = col + dc
        while (r >= 0 && r < size && c >= 0 && c < size && !metadata.blocked[r][c]) {
          if (!solvedCellsRef.current[r]?.[c]) {
            setSelectedCell([r, c])
            return
          }
          r += dr
          c += dc
        }
      }

      setSelectedCell([row, col])
    },
    [submitted, metadata, size, setSelectedCell, setDirection]
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

  const enterLetter = useCallback(
    (raw: string) => {
      const cell = selectedCellRef.current
      if (submitted || !cell) return
      const letter = raw.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      const dir = directionRef.current
      const dr = dir === 'down' ? 1 : 0
      const dc = dir === 'across' ? 1 : 0

      let [row, col] = cell
      while (solvedCellsRef.current[row]?.[col]) {
        const nr = row + dr
        const nc = col + dc
        if (nr < 0 || nr >= size || nc < 0 || nc >= size || metadata.blocked[nr][nc]) return
        row = nr
        col = nc
      }

      setSelectedCell([row, col])
      setLetterGrid((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = letter
        return next
      })
      const nr = row + dr
      const nc = col + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) setSelectedCell([nr, nc])
    },
    [submitted, size, metadata, setSelectedCell]
  )

  const deleteLetter = useCallback(() => {
    const cell = selectedCellRef.current
    if (submitted || !cell) return
    const [row, col] = cell
    if (solvedCellsRef.current[row]?.[col]) return
    setLetterGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = ''
      return next
    })
    const dir = directionRef.current
    const dr = dir === 'down' ? -1 : 0
    const dc = dir === 'across' ? -1 : 0
    const nr = row + dr
    const nc = col + dc
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) setSelectedCell([nr, nc])
  }, [submitted, size, metadata, setSelectedCell])

  useEffect(() => {
    if (submitted) return

    const handler = (e: KeyboardEvent) => {
      const cell = selectedCellRef.current
      if (!cell) return
      const [row, col] = cell

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
  }, [submitted, metadata, size, enterLetter, deleteLetter, setSelectedCell, setDirection])

  const cluesPanel = (
    <div className="fr-card !p-4 max-h-[600px] overflow-y-auto lg:max-h-none lg:h-full">
      <p
        className="font-semibold uppercase tracking-wider mb-2"
        style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
      >
        Clues
      </p>
      <div className="space-y-1" style={{ fontSize: 'var(--text-sm)' }}>
        {clues.map((clue, i) => {
          const solved = solvedClues.has(i)
          return (
            <div
              key={i}
              className={`flex gap-2 ${solved ? 'line-through' : ''}`}
              style={solved ? { color: 'var(--green-600, #16a34a)' } : undefined}
            >
              <span className="font-bold w-8 shrink-0" style={{ color: 'var(--text-faint)' }}>
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
  )

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
        <div>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Solved: </span>
          <span className="font-bold" style={{ fontFeatureSettings: '"tnum"' }}>
            {solvedCount}/{clues.length}
          </span>
        </div>
        <span
          className={`font-mono font-bold ${isTimeUp ? 'text-error' : ''}`}
          style={{ fontSize: 'var(--text-lg)', fontFeatureSettings: '"tnum"' }}
        >
          {formatted}
        </span>
      </div>

      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        Fill the grid using the clues. Tap a cell to select it, type your answer. Tap again to toggle direction.
      </p>

      {/* Desktop: board+keyboard left, clues right. Mobile: stacked. */}
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-4 lg:items-start">
        {/* Left column: board + keyboard */}
        <div className="space-y-4">
          <CrosswordBoard
            metadata={metadata}
            letterGrid={letterGrid}
            mySolvedCells={solvedCells}
            selectedCell={selectedCell}
            activeCells={activeCells}
            onCellSelect={handleCellSelect}
            readOnly={submitted || isTimeUp}
          />

          {/* On-screen keyboard */}
          {!submitted && !isTimeUp && (
            <div className="mx-auto w-full max-w-[min(460px,100%)] select-none space-y-1.5">
              {['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((rowKeys, ri) => (
                <div key={ri} className="flex justify-center gap-1">
                  {ri === 2 && (
                    <button
                      type="button"
                      aria-label="Backspace"
                      onClick={deleteLetter}
                      className="flex h-11 flex-[1.5] items-center justify-center rounded-md text-base font-semibold active:scale-95"
                      style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
                    >
                      ⌫
                    </button>
                  )}
                  {rowKeys.split('').map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => enterLetter(ch)}
                      className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-md text-base font-semibold active:scale-95"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      {ch}
                    </button>
                  ))}
                  {ri === 2 && <div className="flex-[1.5]" aria-hidden />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column (desktop) / below (mobile): clues */}
        {cluesPanel}
      </div>

      {allFilled && !submitted && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary fr-btn--lg" onClick={confirmAndSubmit}>
            Submit Crossword
          </button>
        </div>
      )}
    </div>
  )
}
