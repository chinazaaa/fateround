'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { parseCsvRows } from '@/lib/csv-parse'
import type { TriviaQuestion } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'

type GameType = 'trivia' | 'would_you_rather' | 'most_likely_to' | 'this_or_that' | 'never_have_i_ever'

interface ValidationResult {
  ok: boolean
  errors: string[]
  questions: TriviaQuestion[] | WyrQuestion[] | string[]
  rowCount: number
}

function validateTrivia(rows: Record<string, string>[]): ValidationResult {
  const required = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct']
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  const missing = required.filter((col) => !(col in rows[0]))
  if (missing.length > 0)
    return { ok: false, errors: [`Missing columns: ${missing.join(', ')}`], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: TriviaQuestion[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.question) {
      errors.push(`Row ${rowNum}: question is empty`)
      continue
    }
    if (!r.option_a || !r.option_b || !r.option_c || !r.option_d) {
      errors.push(`Row ${rowNum}: all options (a–d) are required`)
      continue
    }
    const correctRaw = r.correct.toLowerCase().trim()
    if (!['a', 'b', 'c', 'd'].includes(correctRaw)) {
      errors.push(`Row ${rowNum}: 'correct' must be a, b, c, or d`)
      continue
    }
    questions.push({
      question: r.question,
      choices: [r.option_a, r.option_b, r.option_c, r.option_d],
      correctIndex: ['a', 'b', 'c', 'd'].indexOf(correctRaw),
      category: 'general',
    })
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateWyr(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('option_a' in rows[0]) || !('option_b' in rows[0]))
    return { ok: false, errors: ['Missing columns: option_a, option_b'], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: WyrQuestion[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.option_a || !r.option_b) {
      errors.push(`Row ${i + 2}: option_a and option_b are required`)
      continue
    }
    questions.push({ optionA: r.option_a, optionB: r.option_b })
  }
  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateMlt(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('prompt' in rows[0])) return { ok: false, errors: ['Missing column: prompt'], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.prompt) {
      errors.push(`Row ${i + 2}: prompt is empty`)
      continue
    }
    questions.push(r.prompt)
  }
  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

const GAME_TYPES: { value: GameType; label: string; description: string; columns: string }[] = [
  {
    value: 'trivia',
    label: 'Trivia',
    description: 'Multiple-choice questions with one correct answer',
    columns: 'question, option_a, option_b, option_c, option_d, correct',
  },
  {
    value: 'would_you_rather',
    label: 'Would You Rather',
    description: 'Two-option dilemma questions',
    columns: 'option_a, option_b',
  },
  {
    value: 'most_likely_to',
    label: 'Most Likely To',
    description: 'Prompts voted on by the group',
    columns: 'prompt',
  },
  {
    value: 'this_or_that',
    label: 'This or That',
    description: 'Two-option choices players pick between',
    columns: 'option_a, option_b',
  },
  {
    value: 'never_have_i_ever',
    label: 'Never Have I Ever',
    description: 'Prompts players vote on having done',
    columns: 'prompt',
  },
]

const DIFFICULTY_TAGS = ['easy', 'intermediate', 'advanced'] as const
const VIBE_TAGS = ['family-friendly', '18+', 'party', 'spicy'] as const

type DifficultyTag = (typeof DIFFICULTY_TAGS)[number]
type VibeTag = (typeof VIBE_TAGS)[number]

const DIFFICULTY_META: Record<DifficultyTag, { label: string; description: string }> = {
  easy: { label: 'Easy', description: 'Suitable for everyone' },
  intermediate: { label: 'Intermediate', description: 'Some knowledge needed' },
  advanced: { label: 'Advanced', description: 'Challenging questions' },
}

const VIBE_META: Record<VibeTag, { label: string }> = {
  'family-friendly': { label: 'Family-friendly' },
  '18+': { label: '18+' },
  party: { label: 'Party' },
  spicy: { label: 'Spicy' },
}

export default function SubmitPackPage() {
  const router = useRouter()
  const [gameType, setGameType] = useState<GameType | null>(null)
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState<DifficultyTag | null>(null)
  const [vibeTags, setVibeTags] = useState<Set<VibeTag>>(new Set())
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const toggleVibe = (v: VibeTag) =>
    setVibeTags((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gameType) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsvRows(text)
      if (gameType === 'trivia') setValidation(validateTrivia(rows))
      else if (gameType === 'would_you_rather' || gameType === 'this_or_that') setValidation(validateWyr(rows))
      else setValidation(validateMlt(rows)) // covers most_likely_to and never_have_i_ever
    }
    reader.readAsText(file)
  }

  const handleSubmit = async () => {
    if (!gameType || !validation?.ok || !title.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const tags = [...(difficulty ? [difficulty] : []), ...Array.from(vibeTags)]
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          game_type: gameType,
          author_name: authorName.trim() || 'Anonymous',
          description: description.trim() || undefined,
          questions: validation.questions,
          tags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedType = GAME_TYPES.find((g) => g.value === gameType)

  if (submitted) {
    return (
      <PageShell narrow centered>
        <div className="glass-card-strong p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <div className="space-y-1">
            <p className="text-xl font-bold">Pack submitted!</p>
            <p className="text-muted text-sm leading-relaxed">
              Your pack is under review. We&apos;ll publish it once approved.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false)
                setGameType(null)
                setTitle('')
                setAuthorName('')
                setDescription('')
                setDifficulty(null)
                setVibeTags(new Set())
                setValidation(null)
                setFileName('')
                setSubmitError(null)
                if (fileRef.current) fileRef.current.value = ''
              }}
              className="btn-primary btn-fit px-4 py-2 text-sm mx-auto"
            >
              + Create a new pack
            </button>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => router.push('/library')}
                className="btn-secondary btn-fit px-4 py-2 text-sm"
              >
                Browse library
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="btn-secondary btn-fit px-4 py-2 text-sm"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell narrow>
      <div>
        <button type="button" onClick={() => router.push('/library')} className="btn-ghost -ml-2 text-sm">
          ← Library
        </button>
        <h1 className="text-2xl font-black tracking-tight gradient-title mt-1">Submit a question pack</h1>
        <p className="text-muted text-sm mt-1">Share your questions with the community</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted">Game type</p>
        <div className="grid grid-cols-1 gap-2">
          {GAME_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                setGameType(type.value)
                setValidation(null)
                setFileName('')
                if (fileRef.current) fileRef.current.value = ''
              }}
              className={`surface-inset text-left px-4 py-3.5 transition-all ${
                gameType === type.value
                  ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                  : 'hover:border-[var(--border-strong)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p
                    className={`font-semibold text-sm ${gameType === type.value ? 'text-[var(--chip-active-text)]' : ''}`}
                  >
                    {type.label}
                  </p>
                  <p className="text-faint text-xs">{type.description}</p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                    gameType === type.value
                      ? 'border-[var(--chip-active-text)] bg-[var(--chip-active-text)]'
                      : 'border-[var(--border-strong)]'
                  }`}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {gameType && (
        <>
          <Field label="Pack title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Science & Nature Quiz"
              className="input-field"
            />
          </Field>

          <Field label="Your name (optional)">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={60}
              placeholder="Shown publicly — leave blank to appear as Anonymous"
              className="input-field"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What's this pack about?"
              className="input-field resize-none"
            />
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted">Difficulty (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTY_TAGS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(difficulty === d ? null : d)}
                  className={`surface-inset text-left px-3 py-2.5 transition-all ${
                    difficulty === d
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                      : 'hover:border-[var(--border-strong)]'
                  }`}
                >
                  <p className={`font-semibold text-xs ${difficulty === d ? 'text-[var(--chip-active-text)]' : ''}`}>
                    {DIFFICULTY_META[d].label}
                  </p>
                  <p className="text-faint text-[10px] mt-0.5">{DIFFICULTY_META[d].description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted">Vibe tags (optional)</p>
            <div className="flex flex-wrap gap-2">
              {VIBE_TAGS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVibe(v)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    vibeTags.has(v)
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {VIBE_META[v].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted">Upload CSV</p>
              {selectedType && <p className="text-faint text-xs font-mono">{selectedType.columns}</p>}
            </div>

            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`surface-inset w-full py-6 text-center transition-all hover:border-[var(--border-strong)] ${
                fileName ? 'border-[var(--border-strong)]' : ''
              }`}
            >
              {fileName ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-faint text-xs">Click to replace</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted">Choose a .csv file</p>
                  <p className="text-faint text-xs">or click to browse</p>
                </div>
              )}
            </button>
          </div>

          {validation && (
            <div
              className={`surface-inset p-4 space-y-3 ${validation.ok ? 'border-emerald-500/40' : 'border-red-500/40'}`}
            >
              {validation.ok ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 text-sm font-bold">✓</span>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {validation.questions.length} questions ready
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="label-caps text-faint">Preview</p>
                    {gameType === 'trivia' &&
                      (validation.questions as TriviaQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.question}
                        </p>
                      ))}
                    {(gameType === 'would_you_rather' || gameType === 'this_or_that') &&
                      (validation.questions as WyrQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.optionA} <span className="text-faint">or</span> {q.optionB}
                        </p>
                      ))}
                    {(gameType === 'most_likely_to' || gameType === 'never_have_i_ever') &&
                      (validation.questions as string[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q}
                        </p>
                      ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-sm font-bold">✗</span>
                    <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                      {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {validation.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-muted leading-relaxed">
                        {e}
                      </p>
                    ))}
                    {validation.errors.length > 5 && (
                      <p className="text-xs text-faint">…and {validation.errors.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="surface-inset px-4 py-3 border-red-500/40">
              <p className="text-sm text-red-500 dark:text-red-400">{submitError}</p>
            </div>
          )}

          <PrimaryBtn onClick={handleSubmit} disabled={!validation?.ok || !title.trim() || submitting}>
            {submitting ? 'Submitting…' : 'Submit pack'}
          </PrimaryBtn>
        </>
      )}
    </PageShell>
  )
}
