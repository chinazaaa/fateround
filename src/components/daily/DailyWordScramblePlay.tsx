'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'
import { hashWord } from '@/lib/daily-word-hash'
import type { WordScrambleMetadata } from '@/lib/word-scramble'

interface DailyWordScramblePlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

// `skipped` is a Set, which JSON can't serialize — persist it as an array.
type ScrambleProgress = {
  solved: Array<{ index: number; word: string }>
  skipped: number[]
  currentIndex: number
}

export function DailyWordScramblePlay({
  challengeId,
  puzzle,
  timer: maxSeconds,
  onSubmit,
}: DailyWordScramblePlayProps) {
  const metadata = puzzle.metadata as WordScrambleMetadata
  const scrambles = metadata.scrambles ?? []
  const answerHashes = (puzzle.answer_hashes as string[] | undefined) ?? []
  const totalWords = scrambles.length

  const savedProgress = loadDailyAnswers<ScrambleProgress>(challengeId)
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0)
  const [guess, setGuess] = useState('')
  const [wrongGuess, setWrongGuess] = useState(false)
  const [solved, setSolved] = useState<Array<{ index: number; word: string }>>(savedProgress?.solved ?? [])
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set(savedProgress?.skipped ?? []))
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted)
      saveDailyAnswers<ScrambleProgress>(challengeId, {
        solved,
        skipped: [...skipped],
        currentIndex,
      })
  }, [challengeId, solved, skipped, currentIndex, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const solvedIndices = new Set(solved.map((s) => s.index))

  const handleSubmitAll = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: elapsed,
      submission: { answers: solved, hintsUsed: 0 },
    })
  }, [solved, elapsed, onSubmit, challengeId])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmitAll()
  }, [confirm, handleSubmitAll])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmitAll()
  }, [isTimeUp, submitted, handleSubmitAll])

  useEffect(() => {
    if (solved.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmitAll()
    }
  }, [solved.length, totalWords, submitted, handleSubmitAll])

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

    const word = guess.trim()
    // Only a correct unscramble counts. Wrong guesses stay on the word (retry or Skip) — checked
    // against the hashed answer so the solution never reaches the client.
    const expected = answerHashes[currentIndex]
    if (expected && hashWord(word) !== expected) {
      setWrongGuess(true)
      inputRef.current?.focus()
      return
    }

    setSolved((prev) => [...prev, { index: currentIndex, word }])
    setGuess('')
    setWrongGuess(false)

    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)

    inputRef.current?.focus()
  }, [guess, currentIndex, submitted, findNextUnsolved, answerHashes])

  const handleSkip = useCallback(() => {
    if (submitted) return
    setSkipped((prev) => new Set(prev).add(currentIndex))
    setGuess('')
    setWrongGuess(false)
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)
  }, [currentIndex, submitted, findNextUnsolved])

  const currentScramble = scrambles[currentIndex] ?? ''
  const allDone = solved.length + skipped.size >= totalWords

  return (
    <div className="space-y-4">
      {/* Timer + progress */}
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
            {solved.length}/{totalWords}
          </span>
        </div>
        <span
          className={`font-mono font-bold ${isTimeUp ? 'text-error' : ''}`}
          style={{ fontSize: 'var(--text-lg)', fontFeatureSettings: '"tnum"' }}
        >
          {formatted}
        </span>
      </div>

      {/* Current scramble */}
      {!allDone && !submitted && (
        <div className="fr-card fr-card--xl">
          <div className="flex flex-col items-center text-center">
            <p
              className="font-semibold uppercase tracking-wider mb-2"
              style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
            >
              Word {currentIndex + 1} of {totalWords}
            </p>
            <div className="text-3xl font-bold tracking-[0.3em] uppercase mb-5">{currentScramble}</div>

            <div className="flex gap-2 w-full max-w-xs">
              <input
                ref={inputRef}
                type="text"
                value={guess}
                onChange={(e) => {
                  setGuess(e.target.value)
                  if (wrongGuess) setWrongGuess(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGuessSubmit()
                }}
                placeholder="Your answer..."
                className="flex-1 px-4 py-2.5 outline-none"
                style={{
                  background: 'var(--surface-sunken)',
                  border: `1px solid ${wrongGuess ? 'var(--error, #ef4444)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
                autoFocus
                disabled={submitted}
              />
              <button
                className="fr-btn fr-btn--primary"
                onClick={handleGuessSubmit}
                disabled={!guess.trim() || submitted}
              >
                Go
              </button>
            </div>

            {wrongGuess && (
              <p className="mt-2 text-error" style={{ fontSize: 'var(--text-xs)' }}>
                Not quite — try again or skip.
              </p>
            )}

            <div className="flex gap-3 mt-3">
              <button className="fr-btn fr-btn--ghost fr-btn--sm" onClick={handleSkip}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Solved words */}
      <div className="fr-card !p-4">
        <p
          className="font-semibold uppercase tracking-wider mb-2"
          style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
        >
          Your answers
        </p>
        <div className="flex flex-wrap gap-1.5">
          {solved.map((s, i) => (
            <span key={i} className="fr-badge fr-badge--soft font-semibold">
              {s.word.toUpperCase()}
            </span>
          ))}
          {solved.length === 0 && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
              Unscramble the letters to form words
            </span>
          )}
        </div>
      </div>

      {/* Submit button when all attempted */}
      {allDone && !submitted && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary fr-btn--lg" onClick={confirmAndSubmit}>
            Submit ({solved.length} words)
          </button>
        </div>
      )}
    </div>
  )
}
