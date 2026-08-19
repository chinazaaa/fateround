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

const HINT_COST = 80

// `skipped` is a Set, which JSON can't serialize — persist it as an array.
type ScrambleProgress = {
  solved: Array<{ index: number; word: string }>
  skipped: number[]
  currentIndex: number
  hintedIndices: number[]
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

  const hints = metadata.hints ?? []
  const savedProgress = loadDailyAnswers<ScrambleProgress>(challengeId)
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0)
  const [guess, setGuess] = useState('')
  const [wrongGuess, setWrongGuess] = useState(false)
  const [solved, setSolved] = useState<Array<{ index: number; word: string }>>(savedProgress?.solved ?? [])
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set(savedProgress?.skipped ?? []))
  const [hintedIndices, setHintedIndices] = useState<Set<number>>(() => new Set(savedProgress?.hintedIndices ?? []))
  const [showingHint, setShowingHint] = useState(false)
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
        hintedIndices: [...hintedIndices],
      })
  }, [challengeId, solved, skipped, currentIndex, hintedIndices, submitted])

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
      submission: { answers: solved, hintsUsed: hintedIndices.size },
    })
  }, [solved, elapsed, onSubmit, challengeId, hintedIndices.size])

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
    setShowingHint(false)

    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)

    inputRef.current?.focus()
  }, [guess, currentIndex, submitted, findNextUnsolved, answerHashes])

  const handleSkip = useCallback(() => {
    if (submitted) return
    setSkipped((prev) => new Set(prev).add(currentIndex))
    setGuess('')
    setWrongGuess(false)
    setShowingHint(false)
    const next = findNextUnsolved(currentIndex + 1)
    if (next >= 0) setCurrentIndex(next)
  }, [currentIndex, submitted, findNextUnsolved])

  const handleUseHint = useCallback(async () => {
    if (submitted || hintedIndices.has(currentIndex)) return
    const index = currentIndex
    const hint = hints[currentIndex]
    if (!hint) return
    const yes = await confirm({
      title: 'Use hint?',
      message: `This will deduct ${HINT_COST} pts from your final score (out of 1000). Show the hint?`,
      confirmLabel: 'Show hint',
    })
    if (!yes || submitRef.current) return
    setHintedIndices((prev) => new Set(prev).add(index))
    setShowingHint(true)
  }, [submitted, currentIndex, hintedIndices, hints, confirm])

  const currentScramble = scrambles[currentIndex] ?? ''
  const currentHint = hints[currentIndex] ?? ''
  const isHinted = hintedIndices.has(currentIndex)
  const hintVisible = isHinted || showingHint
  const hintPenalty = hintedIndices.size * HINT_COST
  const allSolved = solved.length >= totalWords
  const hasSkipped = skipped.size > 0

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
        <div className="flex items-center gap-4">
          <div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Solved: </span>
            <span className="font-bold" style={{ fontFeatureSettings: '"tnum"' }}>
              {solved.length}/{totalWords}
            </span>
          </div>
          {hintPenalty > 0 && (
            <div>
              <span className="font-bold" style={{ fontFeatureSettings: '"tnum"', color: 'var(--error, #ef4444)' }}>
                -{hintPenalty} pts
              </span>
            </div>
          )}
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
        Unscramble each word. Type your answer and press Enter. Hints available but costly!
      </p>

      {/* Current scramble — shown until every word is solved. Skipping cycles through the remaining
          unsolved (incl. previously skipped) words, so you can always come back to them. */}
      {!allSolved && !submitted && (
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

            {hintVisible && currentHint && (
              <p className="mt-3 italic" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Hint: {currentHint}
              </p>
            )}

            <div className="flex gap-3 mt-3">
              {currentHint && !isHinted && (
                <button className="fr-btn fr-btn--ghost fr-btn--sm" onClick={handleUseHint}>
                  Hint (-{HINT_COST} pts)
                </button>
              )}
              <button className="fr-btn fr-btn--ghost fr-btn--sm" onClick={handleSkip}>
                Skip
              </button>
            </div>
            {hasSkipped && (
              <p className="mt-2" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                Skipped words come back around — or submit when you&apos;re done.
              </p>
            )}
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

      {/* Submit appears once you've skipped a word, so you can finalize whenever. Solving every word
          auto-submits, so there's nothing to click on the last one. */}
      {!submitted && !allSolved && hasSkipped && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary fr-btn--lg" onClick={confirmAndSubmit}>
            Submit ({solved.length} words)
          </button>
        </div>
      )}
    </div>
  )
}
