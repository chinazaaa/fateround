'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

interface TriviaQuestion {
  question: string
  choices: string[]
}

interface DailyTriviaPlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface SavedAnswer {
  questionIndex: number
  choiceIndex: number
}

export function DailyTriviaPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyTriviaPlayProps) {
  const questions = useMemo(() => (puzzle.questions ?? []) as TriviaQuestion[], [puzzle.questions])
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [answers, setAnswers] = useState<SavedAnswer[]>(() => loadDailyAnswers<SavedAnswer[]>(challengeId) ?? [])
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = loadDailyAnswers<SavedAnswer[]>(challengeId)
    return saved ? saved.length : 0
  })
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, answers)
  }, [challengeId, answers, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const answeredCount = answers.length

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: {
        answers: answers.map((a) => ({ questionIndex: a.questionIndex, choiceIndex: a.choiceIndex })),
      },
    })
  }, [answers, challengeId, elapsed, maxSeconds, onSubmit])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  // All questions answered → auto-submit
  useEffect(() => {
    if (answers.length >= questions.length && questions.length > 0 && !submitRef.current && !showFeedback) {
      handleSubmit()
    }
  }, [answers.length, questions.length, handleSubmit, showFeedback])

  const handleAnswer = (choiceIndex: number) => {
    if (submitted || showFeedback) return
    setSelectedChoice(choiceIndex)
    setShowFeedback(true)

    const newAnswer: SavedAnswer = { questionIndex: currentIndex, choiceIndex }

    setTimeout(() => {
      setAnswers((prev) => [...prev, newAnswer])
      setCurrentIndex((prev) => prev + 1)
      setSelectedChoice(null)
      setShowFeedback(false)
    }, 600)
  }

  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  const question = currentIndex < questions.length ? questions[currentIndex] : null

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-bold tabular-nums" style={{ fontSize: 'var(--text-sm)' }}>
          {answeredCount} / {questions.length} answered
        </div>
        <div
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-sm)', color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined }}
        >
          {formatted}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        Answer each question by tapping a choice. Every correct answer scores points — speed matters.
      </p>

      {/* Question card */}
      {question ? (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div
              className="mb-1 font-medium uppercase tracking-wider"
              style={{ fontSize: '11px', color: 'var(--text-faint)' }}
            >
              Question {currentIndex + 1}
            </div>
            <p className="font-bold" style={{ fontSize: 'var(--text-base)' }}>
              {question.question}
            </p>
          </div>

          <div className="grid gap-2">
            {question.choices.map((choice, i) => {
              const isSelected = selectedChoice === i

              let bg = 'var(--card)'
              let border = 'var(--border)'
              if (isSelected) {
                bg = 'var(--surface)'
                border = 'var(--primary)'
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleAnswer(i)}
                  disabled={showFeedback || submitted}
                  className="rounded-xl px-4 py-3 text-left font-medium transition-colors disabled:cursor-default"
                  style={{
                    background: bg,
                    border: `2px solid ${border}`,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span
                    className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full font-bold"
                    style={{
                      fontSize: '12px',
                      background: 'var(--surface)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  {choice}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        !submitted && (
          <div className="py-8 text-center">
            <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
              All questions answered!
            </p>
            <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Submitting...
            </p>
          </div>
        )
      )}

      {/* Manual submit */}
      {question && answers.length > 0 && !submitted && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          Submit ({answers.length}/{questions.length} answered)
        </button>
      )}
    </div>
  )
}
