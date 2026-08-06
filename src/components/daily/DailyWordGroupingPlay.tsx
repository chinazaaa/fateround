'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

/* ---------- types ---------- */

interface DailyWordGroupingPlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface Guess {
  words: string[]
}

interface RevealedGroup {
  category: string
  words: string[]
  difficulty: number
}

interface SavedState {
  guesses: Guess[]
  revealedGroups: RevealedGroup[]
  mistakes: number
}

/* Connections-style group colours by difficulty */
const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

/* ---------- component ---------- */

export function DailyWordGroupingPlay({
  challengeId,
  puzzle,
  timer: maxSeconds,
  onSubmit,
}: DailyWordGroupingPlayProps) {
  const words = useMemo(() => (puzzle.words ?? []) as string[], [puzzle.words])

  /* ---- persisted / initial state ---- */
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const savedState = useMemo(() => loadDailyAnswers<SavedState>(challengeId), [challengeId])
  const [guesses, setGuesses] = useState<Guess[]>(() => savedState?.guesses ?? [])
  const [revealedGroups, setRevealedGroups] = useState<RevealedGroup[]>(() => savedState?.revealedGroups ?? [])
  const [mistakes, setMistakes] = useState(() => savedState?.mistakes ?? 0)

  const [selected, setSelected] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [oneAway, setOneAway] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  /* ---- derived ---- */
  const revealedWords = useMemo(() => new Set(revealedGroups.flatMap((g) => g.words)), [revealedGroups])
  const remainingWords = useMemo(() => words.filter((w) => !revealedWords.has(w)), [words, revealedWords])
  const maxMistakes = 4
  const mistakesRemaining = maxMistakes - mistakes
  const isSolved = revealedGroups.length === 4
  const isLost = mistakes >= maxMistakes

  /* ---- timer ---- */
  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  /* ---- persist on change ---- */
  useEffect(() => {
    if (!submitted) {
      saveDailyAnswers<SavedState>(challengeId, { guesses, revealedGroups, mistakes })
    }
  }, [challengeId, guesses, revealedGroups, mistakes, submitted])

  /* ---- submit helper ---- */
  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { guesses },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, guesses])

  /* auto-submit triggers */
  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  useEffect(() => {
    if (isSolved && !submitRef.current) handleSubmit()
  }, [isSolved, handleSubmit])

  useEffect(() => {
    if (isLost && !submitRef.current) handleSubmit()
  }, [isLost, handleSubmit])

  /* ---- selection ---- */
  const toggleWord = (word: string) => {
    if (submitted || isSolved || isLost) return
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word)
      if (prev.length >= 4) return prev
      return [...prev, word]
    })
  }

  const deselectAll = () => setSelected([])

  /* ---- guess logic ---- */
  // The server sends solution groups in puzzle.groups (stripped from the player view but available
  // server-side for validation). For client-side checking during play we use a hidden prop that the
  // daily challenge wrapper injects. When not available, the guess is always recorded and the server
  // scores it on submit. But per the spec, correct/incorrect feedback is shown in real-time, so we
  // need the groups. They are expected as puzzle._groups: Array<{category, words, difficulty}>.
  const solutionGroups = useMemo(
    () =>
      ((puzzle as Record<string, unknown>)._groups ?? []) as Array<{
        category: string
        words: string[]
        difficulty: number
      }>,
    [puzzle]
  )

  const checkGuess = useCallback(
    (guessWords: string[]): RevealedGroup | null => {
      const sorted = [...guessWords].sort()
      for (const group of solutionGroups) {
        const groupSorted = [...group.words].sort()
        if (groupSorted.length === sorted.length && groupSorted.every((w, i) => w === sorted[i])) {
          return { category: group.category, words: group.words, difficulty: group.difficulty }
        }
      }
      return null
    },
    [solutionGroups]
  )

  const checkOneAway = useCallback(
    (guessWords: string[]): boolean => {
      for (const group of solutionGroups) {
        const overlap = guessWords.filter((w) => group.words.includes(w)).length
        if (overlap === 3) return true
      }
      return false
    },
    [solutionGroups]
  )

  const handleGuessSubmit = () => {
    if (selected.length !== 4 || submitted || isSolved || isLost) return

    const guess: Guess = { words: [...selected] }
    const match = checkGuess(selected)

    if (match) {
      setGuesses((prev) => [...prev, guess])
      setRevealedGroups((prev) => [...prev, match])
      setSelected([])
    } else {
      // Wrong guess
      const isOneAway = checkOneAway(selected)
      setGuesses((prev) => [...prev, guess])
      setMistakes((prev) => prev + 1)

      if (isOneAway) {
        setOneAway(true)
        setTimeout(() => setOneAway(false), 1500)
      }

      setShaking(true)
      setTimeout(() => {
        setShaking(false)
        setSelected([])
      }, 500)
    }
  }

  /* ---- manual submit ---- */
  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  /* ---- render ---- */
  return (
    <div className="space-y-4">
      {/* Keyframe styles */}
      <style>{`
        @keyframes dw-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes dw-one-away {
          0% { opacity: 0; transform: translateY(-8px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        .dw-shake { animation: dw-shake 0.4s ease-in-out; }
        .dw-one-away { animation: dw-one-away 1.5s ease-in-out forwards; }
      `}</style>

      {/* Timer bar */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
            Mistakes
          </span>
          <div className="flex gap-1">
            {Array.from({ length: maxMistakes }).map((_, i) => (
              <span
                key={i}
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background: i < mistakesRemaining ? 'var(--text-muted)' : 'var(--error)',
                  opacity: i < mistakesRemaining ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-sm)', color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined }}
        >
          {formatted}
        </div>
      </div>

      {/* One away toast */}
      {oneAway && (
        <div
          className="dw-one-away rounded-lg px-4 py-2 text-center font-bold"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 'var(--text-sm)',
          }}
        >
          One away!
        </div>
      )}

      {/* Solved groups */}
      {revealedGroups.map((group) => (
        <div
          key={group.category}
          className="rounded-xl px-4 py-3 text-center"
          style={{ background: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1], color: '#1a1a1a' }}
        >
          <div className="font-bold uppercase tracking-wider" style={{ fontSize: 'var(--text-sm)' }}>
            {group.category}
          </div>
          <div className="mt-1 font-medium" style={{ fontSize: 'var(--text-sm)' }}>
            {group.words.join(', ')}
          </div>
        </div>
      ))}

      {/* Word grid */}
      {remainingWords.length > 0 && !submitted && (
        <div className={`grid grid-cols-4 gap-2 ${shaking ? 'dw-shake' : ''}`}>
          {remainingWords.map((word) => {
            const isSelected = selected.includes(word)
            return (
              <button
                key={word}
                type="button"
                onClick={() => toggleWord(word)}
                disabled={submitted || isSolved || isLost}
                className="flex items-center justify-center rounded-lg px-1 py-3 font-bold uppercase transition-colors disabled:cursor-default"
                style={{
                  background: isSelected ? 'var(--surface)' : 'var(--card)',
                  border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  fontSize: 'var(--text-sm)',
                  minHeight: '3.5rem',
                  wordBreak: 'break-word',
                }}
              >
                {word}
              </button>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      {!submitted && !isSolved && !isLost && remainingWords.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={deselectAll}
            disabled={selected.length === 0}
            className="fr-btn fr-btn--secondary fr-btn--sm flex-1"
          >
            Deselect all
          </button>
          <button
            type="button"
            onClick={handleGuessSubmit}
            disabled={selected.length !== 4}
            className="fr-btn fr-btn--primary fr-btn--sm flex-1"
          >
            Submit
          </button>
        </div>
      )}

      {/* Manual early submit */}
      {!submitted && guesses.length > 0 && !isSolved && !isLost && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          End game ({revealedGroups.length}/4 groups found)
        </button>
      )}

      {/* End states shown briefly before auto-submit fires */}
      {!submitted && isSolved && (
        <div className="py-8 text-center">
          <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
            Puzzle solved!
          </p>
          <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Submitting...
          </p>
        </div>
      )}

      {!submitted && isLost && (
        <div className="py-8 text-center">
          <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
            Out of guesses
          </p>
          <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Submitting...
          </p>
        </div>
      )}
    </div>
  )
}
