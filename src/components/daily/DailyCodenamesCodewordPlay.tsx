'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

interface DailyCodenamesCodewordPlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

export function DailyCodenamesCodewordPlay({
  challengeId,
  puzzle,
  timer: maxSeconds,
  onSubmit,
}: DailyCodenamesCodewordPlayProps) {
  const grid = useMemo(() => (puzzle.grid ?? []) as string[], [puzzle.grid])
  const clue = (puzzle.clue ?? '') as string
  const clueNumber = (puzzle.clueNumber ?? 0) as number

  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [selectedWords, setSelectedWords] = useState<string[]>(() => loadDailyAnswers<string[]>(challengeId) ?? [])
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, selectedWords)
  }, [challengeId, selectedWords, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { selectedWords },
    })
  }, [selectedWords, challengeId, elapsed, maxSeconds, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  const toggleWord = (word: string) => {
    if (submitted) return
    setSelectedWords((prev) => {
      if (prev.includes(word)) {
        return prev.filter((w) => w !== word)
      }
      if (prev.length >= clueNumber) return prev
      return [...prev, word]
    })
  }

  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  const selectionComplete = selectedWords.length === clueNumber

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        The clue hints at words in the grid. Select the matching words (up to the clue number), then submit.
      </p>

      {/* Clue card */}
      <div
        className="rounded-xl p-5 text-center"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div
          className="mb-1 font-medium uppercase tracking-wider"
          style={{ fontSize: '11px', color: 'var(--text-faint)' }}
        >
          Clue
        </div>
        <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
          {clue} &mdash; {clueNumber}
        </p>
      </div>

      {/* Timer bar */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-bold tabular-nums" style={{ fontSize: 'var(--text-sm)' }}>
          {selectedWords.length} / {clueNumber} selected
        </div>
        <div
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-sm)', color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined }}
        >
          {formatted}
        </div>
      </div>

      {/* 5x5 grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {grid.map((word, i) => {
          const isSelected = selectedWords.includes(word)
          const atCap = selectedWords.length >= clueNumber

          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleWord(word)}
              disabled={submitted}
              className="flex items-center justify-center rounded-lg px-1 py-3 font-bold transition-colors"
              style={{
                background: isSelected ? 'var(--primary)' : 'var(--card)',
                border: isSelected ? '2px solid var(--primary)' : '2px solid var(--border)',
                color: isSelected ? '#fff' : undefined,
                fontSize: 'var(--text-sm)',
                cursor: submitted ? 'default' : !isSelected && atCap ? 'not-allowed' : 'pointer',
                opacity: !isSelected && atCap ? 0.5 : 1,
                minHeight: '48px',
                wordBreak: 'break-word',
                textAlign: 'center',
              }}
            >
              {word}
            </button>
          )
        })}
      </div>

      {/* Submit button */}
      {!submitted && (
        <button
          type="button"
          onClick={handleManualSubmit}
          disabled={!selectionComplete}
          className="fr-btn fr-btn--primary w-full"
          style={{ opacity: selectionComplete ? 1 : 0.5 }}
        >
          Submit ({selectedWords.length}/{clueNumber} selected)
        </button>
      )}
    </div>
  )
}
