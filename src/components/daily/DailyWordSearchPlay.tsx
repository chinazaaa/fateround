'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { WordSearchBoard } from '@/components/word-search/WordSearchBoard'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import type { WordSearchMetadata } from '@/lib/word-search'

interface DailyWordSearchPlayProps {
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyWordSearchPlay({ puzzle, timer: maxSeconds, onSubmit }: DailyWordSearchPlayProps) {
  const metadata = puzzle.metadata as WordSearchMetadata
  const totalWords = metadata.words?.length ?? 0

  const [foundWords, setFoundWords] = useState<string[]>([])
  const [myFoundCells, setMyFoundCells] = useState<boolean[][]>(() =>
    Array.from({ length: metadata.size }, () => Array(metadata.size).fill(false))
  )
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
  })

  const wordsSet = useMemo(() => new Set(metadata.words?.map((w) => w.toUpperCase()) ?? []), [metadata.words])
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toUpperCase())), [foundWords])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    onSubmit({
      timeSeconds: elapsed,
      submission: { words: foundWords, hintsUsed: 0 },
    })
  }, [foundWords, elapsed, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  // Auto-submit when all words found
  useEffect(() => {
    if (foundWords.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmit()
    }
  }, [foundWords.length, totalWords, submitted, handleSubmit])

  const handleSelect = useCallback(
    (start: [number, number], end: [number, number]) => {
      if (submitted) return
      // Extract word from grid between start and end
      const [sr, sc] = start
      const [er, ec] = end
      const dr = er === sr ? 0 : er > sr ? 1 : -1
      const dc = ec === sc ? 0 : ec > sc ? 1 : -1
      const steps = Math.max(Math.abs(er - sr), Math.abs(ec - sc))

      let word = ''
      const cells: [number, number][] = []
      for (let i = 0; i <= steps; i++) {
        const r = sr + dr * i
        const c = sc + dc * i
        word += metadata.grid[r]?.[c] ?? ''
        cells.push([r, c])
      }

      const upper = word.toUpperCase()
      const reversed = upper.split('').reverse().join('')
      const match = wordsSet.has(upper) ? upper : wordsSet.has(reversed) ? reversed : null

      if (match && !foundSet.has(match)) {
        setFoundWords((prev) => [...prev, match])
        setMyFoundCells((prev) => {
          const next = prev.map((row) => [...row])
          for (const [r, c] of cells) next[r][c] = true
          return next
        })
      }
    },
    [metadata.grid, wordsSet, foundSet, submitted]
  )

  return (
    <div className="space-y-4">
      {/* Timer + progress bar */}
      <div className="flex items-center justify-between rounded-lg bg-base-200 px-4 py-2">
        <div>
          <span className="text-sm font-medium text-base-content/60">Found: </span>
          <span className="font-bold">
            {foundWords.length}/{totalWords}
          </span>
        </div>
        <span className={`font-mono text-lg font-bold ${isTimeUp ? 'text-error' : ''}`}>{formatted}</span>
      </div>

      {/* Board */}
      <WordSearchBoard
        metadata={metadata}
        myFoundCells={myFoundCells}
        onSelect={handleSelect}
        readOnly={submitted || isTimeUp}
      />

      {/* Word list */}
      <div className="rounded-lg bg-base-200 p-3">
        <div className="flex flex-wrap gap-1">
          {(metadata.words ?? []).map((word, i) => (
            <span
              key={i}
              className={`badge badge-sm ${foundSet.has(word.toUpperCase()) ? 'badge-primary' : 'badge-ghost'}`}
            >
              {foundSet.has(word.toUpperCase()) ? word : '???'}
            </span>
          ))}
        </div>
      </div>

      {!submitted && !isTimeUp && foundWords.length > 0 && foundWords.length < totalWords && (
        <div className="text-center">
          <button className="btn btn-primary" onClick={handleSubmit}>
            Submit ({foundWords.length}/{totalWords})
          </button>
        </div>
      )}
    </div>
  )
}
