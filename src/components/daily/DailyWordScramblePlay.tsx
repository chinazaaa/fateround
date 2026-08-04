'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import type { WordScrambleMetadata } from '@/lib/word-scramble'

interface DailyWordScramblePlayProps {
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyWordScramblePlay({ puzzle, timer: maxSeconds, onSubmit }: DailyWordScramblePlayProps) {
  const metadata = puzzle.metadata as WordScrambleMetadata
  const scrambles = metadata.scrambles ?? []
  const hints = metadata.hints ?? []
  const totalWords = scrambles.length

  const [currentIndex, setCurrentIndex] = useState(0)
  const [guess, setGuess] = useState('')
  const [solved, setSolved] = useState<Array<{ index: number; word: string }>>([])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [showHint, setShowHint] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { confirm } = useConfirm()

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
  })

  const solvedIndices = new Set(solved.map((s) => s.index))

  const handleSubmitAll = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    onSubmit({
      timeSeconds: elapsed,
      submission: { answers: solved, hintsUsed },
    })
  }, [solved, elapsed, hintsUsed, onSubmit])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmitAll()
  }, [confirm, handleSubmitAll])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmitAll()
  }, [isTimeUp, submitted, handleSubmitAll])

  // Auto-submit when all words solved
  useEffect(() => {
    if (solved.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmitAll()
    }
  }, [solved.length, totalWords, submitted, handleSubmitAll])

  // Find next unsolved index
  const findNextUnsolved = useCallback(
    (from: number) => {
      for (let i = 0; i < totalWords; i++) {
        const idx = (from + i) % totalWords
        if (!solvedIndices.has(idx)) return idx
      }
      return -1
    },
    [totalWords, solvedIndices]
  )

  const handleGuessSubmit = useCallback(() => {
    if (!guess.trim() || submitted) return

    // Accept the guess (server will verify at finish)
    const word = guess.trim()
    setSolved((prev) => [...prev, { index: currentIndex, word }])
    setGuess('')
    setShowHint(false)

    // Move to next unsolved
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)

    inputRef.current?.focus()
  }, [guess, currentIndex, submitted, findNextUnsolved])

  const handleSkip = useCallback(() => {
    if (submitted) return
    setSkipped((prev) => new Set(prev).add(currentIndex))
    setGuess('')
    setShowHint(false)
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)
  }, [currentIndex, submitted, findNextUnsolved])

  const handleShowHint = useCallback(() => {
    setShowHint(true)
    setHintsUsed((prev) => prev + 1)
  }, [])

  const currentScramble = scrambles[currentIndex] ?? ''
  const currentHint = hints[currentIndex] ?? null
  const allDone = solved.length + skipped.size >= totalWords

  return (
    <div className="space-y-4">
      {/* Timer + progress */}
      <div className="flex items-center justify-between rounded-lg bg-base-200 px-4 py-2">
        <div>
          <span className="text-sm font-medium text-base-content/60">Solved: </span>
          <span className="font-bold">
            {solved.length}/{totalWords}
          </span>
        </div>
        <span className={`font-mono text-lg font-bold ${isTimeUp ? 'text-error' : ''}`}>{formatted}</span>
      </div>

      {/* Current scramble */}
      {!allDone && !submitted && (
        <div className="card bg-base-200">
          <div className="card-body items-center text-center">
            <div className="text-xs text-base-content/50 mb-1">
              Word {currentIndex + 1} of {totalWords}
            </div>
            <div className="text-3xl font-bold tracking-[0.3em] uppercase mb-4">{currentScramble}</div>

            {showHint && currentHint && <div className="text-sm text-base-content/60 mb-2">Hint: {currentHint}</div>}

            <div className="flex gap-2 w-full max-w-xs">
              <input
                ref={inputRef}
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGuessSubmit()
                }}
                placeholder="Your answer..."
                className="input input-bordered flex-1"
                autoFocus
                disabled={submitted}
              />
              <button className="btn btn-primary" onClick={handleGuessSubmit} disabled={!guess.trim() || submitted}>
                Go
              </button>
            </div>

            <div className="flex gap-2 mt-2">
              {!showHint && currentHint && (
                <button className="btn btn-ghost btn-xs" onClick={handleShowHint}>
                  Show hint
                </button>
              )}
              <button className="btn btn-ghost btn-xs" onClick={handleSkip}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Solved words */}
      <div className="rounded-lg bg-base-200 p-3">
        <div className="text-sm font-medium text-base-content/60 mb-2">Your answers</div>
        <div className="flex flex-wrap gap-1">
          {solved.map((s, i) => (
            <span key={i} className="badge badge-sm badge-primary">
              {s.word.toUpperCase()}
            </span>
          ))}
          {solved.length === 0 && (
            <span className="text-sm text-base-content/40">Unscramble the letters to form words</span>
          )}
        </div>
      </div>

      {/* Submit button when all attempted */}
      {allDone && !submitted && (
        <div className="text-center">
          <button className="btn btn-primary btn-lg" onClick={confirmAndSubmit}>
            Submit ({solved.length} words)
          </button>
        </div>
      )}
    </div>
  )
}
