'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { WordHuntGrid } from '@/components/word-hunt/WordHuntGrid'
import { WORD_HUNT_GRID_SIZE, wordFromPath, WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { hashWord } from '@/lib/daily-word-hash'

interface DailyWordHuntPlayProps {
  grid: string[][]
  /** Hashes of the board's valid words — lets the client reject non-words without exposing answers. */
  validWordHashes: string[]
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

function scoreWord(word: string): number {
  const len = word.length
  if (len === 3) return 100
  if (len === 4) return 400
  if (len === 5) return 800
  return 800 + (len - 5) * 400
}

export function DailyWordHuntPlay({ grid, validWordHashes, timer: maxSeconds, onSubmit }: DailyWordHuntPlayProps) {
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  const validHashSet = useMemo(() => new Set(validWordHashes), [validWordHashes])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
  })

  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toLowerCase())), [foundWords])
  const totalPoints = foundWords.reduce((sum, w) => sum + scoreWord(w), 0)

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    onSubmit({
      timeSeconds: elapsed,
      submission: { words: foundWords },
    })
  }, [foundWords, elapsed, onSubmit])

  // Auto-submit on time up
  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const handleStrokeEnd = useCallback(
    (path: number[]) => {
      if (submitted) return
      const word = wordFromPath(grid, path).toLowerCase()
      // Only accept a real board word (hash membership) that meets the length floor and is new.
      if (word.length >= WORD_HUNT_MIN_WORD_LENGTH && !foundSet.has(word) && validHashSet.has(hashWord(word))) {
        setFoundWords((prev) => [...prev, word])
      }
      setSelectedPath([])
    },
    [grid, foundSet, validHashSet, submitted]
  )

  return (
    <div className="space-y-4">
      {/* Timer + score bar */}
      <div className="flex items-center justify-between rounded-lg bg-base-200 px-4 py-2">
        <div>
          <span className="text-sm font-medium text-base-content/60">Score: </span>
          <span className="font-bold">{totalPoints}</span>
        </div>
        <span className={`font-mono text-lg font-bold ${isTimeUp ? 'text-error' : ''}`}>{formatted}</span>
      </div>

      {/* Grid */}
      <div className="mx-auto" style={{ maxWidth: '320px' }}>
        <WordHuntGrid
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={setSelectedPath}
          onStrokeEnd={handleStrokeEnd}
          disabled={submitted || isTimeUp}
        />
      </div>

      {/* Found words */}
      <div className="rounded-lg bg-base-200 p-3">
        <div className="text-sm font-medium text-base-content/60 mb-2">Words found: {foundWords.length}</div>
        <div className="flex flex-wrap gap-1">
          {foundWords.map((word, i) => (
            <span key={i} className="badge badge-sm badge-primary">
              {word.toUpperCase()} +{scoreWord(word)}
            </span>
          ))}
          {foundWords.length === 0 && <span className="text-sm text-base-content/40">Trace letters to form words</span>}
        </div>
      </div>

      {/* Manual submit button */}
      {!submitted && !isTimeUp && foundWords.length > 0 && (
        <div className="text-center">
          <button className="btn btn-primary" onClick={handleSubmit}>
            Submit ({foundWords.length} words)
          </button>
        </div>
      )}
    </div>
  )
}
