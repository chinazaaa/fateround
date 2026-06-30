'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game, QuestionSource, TriviaCategory, TriviaQuestion } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Field, Chip } from '@/components/ui/PageShell'
import { ChipGrid, SegmentedControl } from '@/components/ui/CreateWizard'
import { TriviaTimerPicker } from '@/components/trivia/TriviaTimerPicker'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import {
  mergeTriviaQuestions,
  parseExcelTriviaQuestionImport,
  parseQuestionSource,
  parseStoredTriviaQuestions,
  parseTriviaQuestionImport,
  formatTriviaImportSummary,
  questionRoundPickerOptions,
  questionSampleFile,
  questionUploadHint,
  questionSourceOptions,
} from '@/lib/custom-questions'
import { TRIVIA_QUESTION_COUNT } from '@/lib/trivia-questions'
import {
  TRIVIA_MAX_ROUNDS,
  TRIVIA_MIN_ROUNDS,
  TRIVIA_DEFAULT_TIMER,
  clampTriviaTimer,
  triviaCategoryFromGame,
} from '@/lib/trivia'

export type TriviaSettingsPayload = {
  question_source: QuestionSource
  trivia_category: TriviaCategory
  timer_seconds: number
  rounds_count: number
  custom_questions?: TriviaQuestion[]
}

/** @deprecated Use TriviaSettingsPayload */
export type TriviaPlayAgainPayload = TriviaSettingsPayload

type PoolMode = 'same' | 'change'
type PoolTab = 'upload' | 'manual'

export type TriviaSettingsVariant = 'lobby' | 'play-again'

interface TriviaPlayAgainSetupProps {
  open: boolean
  onClose: () => void
  game: Game
  loading?: boolean
  variant?: TriviaSettingsVariant
  onConfirm: (payload: TriviaSettingsPayload) => void | Promise<void>
}

export function TriviaPlayAgainSetup({
  open,
  onClose,
  game,
  loading,
  variant = 'play-again',
  onConfirm,
}: TriviaPlayAgainSetupProps) {
  const isLobby = variant === 'lobby'
  const [questionSource, setQuestionSource] = useState<QuestionSource>('platform')
  const [questionMode, setQuestionMode] = useState<PoolMode>('same')
  const [questionTab, setQuestionTab] = useState<PoolTab>('upload')
  const [triviaCategory, setTriviaCategory] = useState<TriviaCategory>('general')
  const [timerSeconds, setTimerSeconds] = useState(TRIVIA_DEFAULT_TIMER)
  const [roundsCount, setRoundsCount] = useState(10)
  const [customQuestions, setCustomQuestions] = useState<TriviaQuestion[]>([])
  const [questionsUploadError, setQuestionsUploadError] = useState<string | null>(null)
  const [questionsUploadInfo, setQuestionsUploadInfo] = useState<string | null>(null)
  const [questionsBulkPaste, setQuestionsBulkPaste] = useState('')
  const [confirming, setConfirming] = useState(false)
  const questionsFileRef = useRef<HTMLInputElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true

    const source = parseQuestionSource(game.question_source, 'trivia')
    setQuestionSource(source)
    setQuestionMode('same')
    setQuestionTab('upload')
    setTriviaCategory(triviaCategoryFromGame(game))
    setTimerSeconds(clampTriviaTimer(game.timer_seconds))
    setRoundsCount(game.rounds_count ?? 10)
    setCustomQuestions(parseStoredTriviaQuestions(game.custom_questions))
    setQuestionsUploadError(null)
    setQuestionsUploadInfo(null)
    setQuestionsBulkPaste('')
  }, [open, game])

  const storedCustomCount = parseStoredTriviaQuestions(game.custom_questions).length
  const customPoolSize = customQuestions.length > 0 ? customQuestions.length : storedCustomCount
  const questionCap =
    questionSource === 'platform' ? TRIVIA_QUESTION_COUNT : customPoolSize > 0 ? customPoolSize : TRIVIA_MAX_ROUNDS
  const roundOptions = useMemo(
    () => questionRoundPickerOptions(questionCap).filter((n) => n >= TRIVIA_MIN_ROUNDS && n <= TRIVIA_MAX_ROUNDS),
    [questionCap]
  )

  useEffect(() => {
    if (roundOptions.length === 0) return
    if (!roundOptions.includes(roundsCount)) {
      setRoundsCount((current) => {
        if (roundOptions.includes(current)) return current
        return roundOptions[roundOptions.length - 1] ?? TRIVIA_MIN_ROUNDS
      })
    }
  }, [roundOptions, roundsCount])

  useEffect(() => {
    if (
      (questionSource === 'custom' || questionSource === 'library') &&
      customQuestions.length > 0 &&
      roundsCount > customQuestions.length
    ) {
      setRoundsCount(customQuestions.length)
    }
  }, [customQuestions.length, questionSource, roundsCount])

  const addQuestionsFromRows = (result: ReturnType<typeof parseTriviaQuestionImport>, replace = false) => {
    if (result.questions.length === 0) return
    setCustomQuestions(replace ? result.questions : (prev) => mergeTriviaQuestions(prev, result.questions))
    setQuestionsUploadError(null)
    const summary = formatTriviaImportSummary(result)
    setQuestionsUploadInfo(
      summary
        ? `Loaded ${result.questions.length} question${result.questions.length === 1 ? '' : 's'} · ${summary}`
        : `Loaded ${result.questions.length} question${result.questions.length === 1 ? '' : 's'}`
    )
  }

  const handleQuestionsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setQuestionsUploadError(null)
    setQuestionsUploadInfo(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    const replace = isLobby || questionMode === 'change'

    try {
      if (ext === 'csv') {
        const text = await file.text()
        const result = parseTriviaQuestionImport(text, triviaCategory)
        if (result.questions.length === 0) {
          setQuestionsUploadError('No valid rows. Check the sample CSV format.')
          return
        }
        addQuestionsFromRows(result, replace)
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const result = await parseExcelTriviaQuestionImport(buffer, triviaCategory)
        if (result.questions.length === 0) {
          setQuestionsUploadError('No valid rows. Check the sample CSV format.')
          return
        }
        addQuestionsFromRows(result, replace)
        return
      }

      setQuestionsUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setQuestionsUploadError('Could not read that file. Try the sample CSV.')
    }
  }

  const showCustomUpload = isLobby || questionMode === 'change' || storedCustomCount === 0
  const showCustomKeepMode = !isLobby && storedCustomCount > 0

  const handleConfirm = async () => {
    const storedCustom = parseStoredTriviaQuestions(game.custom_questions)
    // A library pick produces a custom pool; the backend only understands 'custom'.
    const usesCustomPool = questionSource === 'custom' || questionSource === 'library'

    if (usesCustomPool) {
      const pool =
        isLobby || questionMode === 'change' || questionSource === 'library'
          ? customQuestions.length > 0
            ? customQuestions
            : storedCustom
          : storedCustom

      if (pool.length === 0) {
        setQuestionsUploadError(questionSource === 'library' ? 'Pick a library pack' : 'Upload at least one question')
        return
      }
      if (pool.length < roundsCount) {
        setQuestionsUploadError(`Need at least ${roundsCount} questions for ${roundsCount} rounds`)
        return
      }
    }

    const payload: TriviaSettingsPayload = {
      question_source: usesCustomPool ? 'custom' : questionSource,
      trivia_category: triviaCategory,
      timer_seconds: clampTriviaTimer(timerSeconds),
      rounds_count: roundsCount,
    }

    if (usesCustomPool) {
      const shouldSendCustom =
        isLobby || questionSource === 'library'
          ? customQuestions.length > 0
          : questionMode === 'change' && customQuestions.length > 0
      if (shouldSendCustom) {
        payload.custom_questions = customQuestions
      }
    }

    setConfirming(true)
    try {
      await onConfirm(payload)
    } finally {
      setConfirming(false)
    }
  }

  const sample = questionSampleFile('trivia')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isLobby ? 'Game settings' : 'Play again'}
      subtitle={
        isLobby
          ? 'Change before you start — unused questions are picked first.'
          : 'Same room and link — players stay connected. Unused questions are picked first.'
      }
      size="lg"
    >
      <div className="space-y-6">
        <Field label="Question source">
          <SegmentedControl
            value={questionSource}
            onChange={(v) => {
              setQuestionSource(v as QuestionSource)
              setQuestionsUploadError(null)
              if (v === 'platform') setQuestionMode('same')
            }}
            options={questionSourceOptions('trivia')}
          />
        </Field>

        {questionSource === 'platform' && (
          <Field label="Category">
            <SegmentedControl
              value={triviaCategory}
              onChange={(v) => setTriviaCategory(v as TriviaCategory)}
              options={[
                { value: 'tech', label: 'Tech', hint: 'Programming, gadgets, internet culture' },
                { value: 'general', label: 'General', hint: 'Geography, history, pop culture & more' },
              ]}
            />
          </Field>
        )}

        {questionSource === 'custom' && (
          <div className="space-y-3">
            <p className="label-caps">Your questions</p>
            <p className="text-faint text-xs">{questionUploadHint('trivia')}</p>
            <a href={sample.href} download={sample.download} className="text-sm text-[var(--primary)] underline">
              Download sample CSV
            </a>

            {isLobby && customQuestions.length > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {customQuestions.length} question{customQuestions.length === 1 ? '' : 's'} already loaded — kept
                (unused first) unless you replace them below.
              </p>
            )}

            {showCustomKeepMode && (
              <SegmentedControl
                value={questionMode}
                onChange={setQuestionMode}
                options={[
                  { value: 'same', label: 'Keep current', hint: 'Reuse your uploaded pool' },
                  { value: 'change', label: 'Upload new', hint: 'Replace with a new CSV or paste' },
                ]}
              />
            )}

            {showCustomKeepMode && questionMode === 'same' && (
              <p className="text-muted text-sm">
                {storedCustomCount} question{storedCustomCount === 1 ? '' : 's'} in your pool — unused ones are picked
                first. Switch to <strong className="text-body">Upload new</strong> to replace them.
              </p>
            )}

            {showCustomUpload && (
              <div className="space-y-4 pt-1">
                <SegmentedControl
                  value={questionTab}
                  onChange={setQuestionTab}
                  options={[
                    { value: 'upload', label: 'Upload file' },
                    { value: 'manual', label: 'Paste' },
                  ]}
                />

                {questionTab === 'upload' && (
                  <div className="space-y-2">
                    <input
                      ref={questionsFileRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleQuestionsFileUpload}
                    />
                    <button
                      type="button"
                      onClick={() => questionsFileRef.current?.click()}
                      className="btn-secondary w-full py-3 text-sm"
                    >
                      Choose CSV or Excel file
                    </button>
                  </div>
                )}

                {questionTab === 'manual' && (
                  <div className="space-y-2">
                    <textarea
                      value={questionsBulkPaste}
                      onChange={(e) => setQuestionsBulkPaste(e.target.value)}
                      placeholder="Paste questions (one per line, CSV format)"
                      rows={5}
                      className="input-field w-full text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const result = parseTriviaQuestionImport(questionsBulkPaste, triviaCategory)
                        if (result.questions.length === 0) {
                          setQuestionsUploadError('No valid rows found')
                          return
                        }
                        addQuestionsFromRows(result, true)
                        setQuestionsBulkPaste('')
                      }}
                      disabled={!questionsBulkPaste.trim()}
                      className="btn-secondary w-full py-2.5 text-sm"
                    >
                      Add pasted questions
                    </button>
                  </div>
                )}

                {!isLobby && customQuestions.length > 0 && (
                  <p className="text-muted text-sm">
                    {customQuestions.length} question{customQuestions.length === 1 ? '' : 's'} in pool
                  </p>
                )}

                {questionsUploadInfo && (
                  <p className="text-emerald-600 dark:text-emerald-400 text-sm">{questionsUploadInfo}</p>
                )}
              </div>
            )}
          </div>
        )}

        {questionSource === 'library' && (
          <div className="space-y-2">
            <p className="label-caps">Library pack</p>
            <LibraryPackBrowser
              gameType="trivia"
              onPick={(questions) => {
                setQuestionsUploadError(null)
                setCustomQuestions(parseStoredTriviaQuestions(questions))
              }}
            />
            {customQuestions.length > 0 && (
              <p className="text-muted text-sm">
                {customQuestions.length} question{customQuestions.length === 1 ? '' : 's'} loaded from this pack.
              </p>
            )}
            <p className="text-faint text-xs">Picking a pack replaces the current pool.</p>
          </div>
        )}

        <Field label="Time per question">
          <TriviaTimerPicker value={timerSeconds} onChange={setTimerSeconds} />
        </Field>

        <Field label="Rounds">
          <ChipGrid>
            {roundOptions.map((n) => (
              <Chip key={n} active={roundsCount === n} onClick={() => setRoundsCount(n)} className="!px-0 w-full">
                {n}
              </Chip>
            ))}
          </ChipGrid>
        </Field>

        {questionsUploadError && <p className="text-rose-500 text-sm">{questionsUploadError}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={loading} className="btn-secondary flex-1 py-3">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || confirming || (!isLobby && game.status !== 'finished')}
            className="btn-primary flex-1 py-3"
          >
            {loading || confirming
              ? 'Saving…'
              : !isLobby && game.status !== 'finished'
                ? 'Finishing game…'
                : isLobby
                  ? 'Save settings'
                  : 'Reopen lobby'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
