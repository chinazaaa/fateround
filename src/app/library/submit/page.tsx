'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { PageShell, BackBtn, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { parseCsvRows } from '@/lib/csv-parse'
import type { TriviaQuestion } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'

type GameType = 'trivia' | 'would_you_rather' | 'most_likely_to'

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
  if (missing.length > 0) return { ok: false, errors: [`Missing columns: ${missing.join(', ')}`], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: TriviaQuestion[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.question) { errors.push(`Row ${rowNum}: question is empty`); continue }
    if (!r.option_a || !r.option_b || !r.option_c || !r.option_d) {
      errors.push(`Row ${rowNum}: all options (a–d) are required`); continue
    }
    const correctRaw = r.correct.toLowerCase().trim()
    if (!['a', 'b', 'c', 'd'].includes(correctRaw)) {
      errors.push(`Row ${rowNum}: 'correct' must be a, b, c, or d`); continue
    }
    const correctIndex = ['a', 'b', 'c', 'd'].indexOf(correctRaw)
    questions.push({
      question: r.question,
      choices: [r.option_a, r.option_b, r.option_c, r.option_d],
      correctIndex,
      category: 'general',
    })
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')

  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateWyr(rows: Record<string, string>[]): ValidationResult {
  const errors: string[] = []
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('option_a' in rows[0]) || !('option_b' in rows[0])) {
    return { ok: false, errors: ['Missing columns: option_a, option_b'], questions: [], rowCount: 0 }
  }

  const questions: WyrQuestion[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.option_a || !r.option_b) { errors.push(`Row ${rowNum}: option_a and option_b are required`); continue }
    questions.push({ optionA: r.option_a, optionB: r.option_b })
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')

  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateMlt(rows: Record<string, string>[]): ValidationResult {
  const errors: string[] = []
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('prompt' in rows[0])) {
    return { ok: false, errors: ['Missing column: prompt'], questions: [], rowCount: 0 }
  }

  const questions: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.prompt) { errors.push(`Row ${rowNum}: prompt is empty`); continue }
    questions.push(r.prompt)
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')

  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

const FORMAT_HINTS: Record<GameType, string> = {
  trivia: 'Required columns: question, option_a, option_b, option_c, option_d, correct (a/b/c/d)',
  would_you_rather: 'Required columns: option_a, option_b',
  most_likely_to: 'Required column: prompt',
}

const GAME_TYPE_LABELS: Record<GameType, string> = {
  trivia: 'Trivia',
  would_you_rather: 'Would You Rather',
  most_likely_to: 'Most Likely To',
}

export default function SubmitPackPage() {
  const [gameType, setGameType] = useState<GameType | null>(null)
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [description, setDescription] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gameType) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsvRows(text)
      if (gameType === 'trivia') setValidation(validateTrivia(rows))
      else if (gameType === 'would_you_rather') setValidation(validateWyr(rows))
      else setValidation(validateMlt(rows))
    }
    reader.readAsText(file)
  }

  const handleSubmit = async () => {
    if (!gameType || !validation?.ok || !title.trim() || !authorName.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          game_type: gameType,
          author_name: authorName.trim(),
          description: description.trim() || undefined,
          questions: validation.questions,
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

  if (submitted) {
    return (
      <PageShell narrow centered>
        <div className="glass-card p-8 text-center space-y-4">
          <p className="text-xl font-bold">Pack submitted!</p>
          <p className="text-muted text-sm">
            Your pack is under review. We&apos;ll publish it once approved.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link href="/library" className="btn-secondary btn-fit px-4 py-2 text-sm no-underline">
              Browse library
            </Link>
            <Link href="/" className="btn-secondary btn-fit px-4 py-2 text-sm no-underline">
              Home
            </Link>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell narrow>
      <div>
        <Link href="/library">
          <BackBtn onClick={() => {}} label="Library" />
        </Link>
        <h1 className="text-2xl font-black tracking-tight gradient-title mt-1">Submit a question pack</h1>
      </div>

      <Field label="Game type">
        <div className="grid grid-cols-1 gap-2">
          {(['trivia', 'would_you_rather', 'most_likely_to'] as GameType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setGameType(type); setValidation(null); if (fileRef.current) fileRef.current.value = '' }}
              className={`glass-card p-4 text-left transition-all ${gameType === type ? 'border-[var(--primary)] shadow-md' : 'hover:border-[var(--border-strong)]'}`}
            >
              <p className="font-semibold">{GAME_TYPE_LABELS[type]}</p>
              <p className="text-muted text-xs mt-0.5">{FORMAT_HINTS[type]}</p>
            </button>
          ))}
        </div>
      </Field>

      {gameType && (
        <>
          <Field label="Pack title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Science & Nature Quiz"
              className="input w-full"
            />
          </Field>

          <Field label="Your name">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={60}
              placeholder="Shown publicly on the pack"
              className="input w-full"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="A short description of your pack"
              className="input w-full resize-none"
            />
          </Field>

          <Field label="Upload CSV">
            <div className="space-y-3">
              <p className="text-muted text-xs">{FORMAT_HINTS[gameType]}</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-secondary w-full"
              >
                Choose CSV file
              </button>
            </div>
          </Field>

          {validation && (
            <div className={`glass-card p-4 space-y-2 ${validation.ok ? 'border-green-500/40' : 'border-red-500/40'}`}>
              {validation.ok ? (
                <>
                  <p className="text-sm font-medium text-green-400">
                    {validation.questions.length} valid rows loaded
                  </p>
                  <div className="space-y-1 pt-1">
                    <p className="label-caps text-muted">Preview (first 3)</p>
                    {gameType === 'trivia' &&
                      (validation.questions as TriviaQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-sm text-muted truncate">{q.question}</p>
                      ))}
                    {gameType === 'would_you_rather' &&
                      (validation.questions as WyrQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-sm text-muted truncate">{q.optionA} or {q.optionB}</p>
                      ))}
                    {gameType === 'most_likely_to' &&
                      (validation.questions as string[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-sm text-muted truncate">{q}</p>
                      ))}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-400">{validation.errors.length} error(s)</p>
                  {validation.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-muted">{e}</p>
                  ))}
                  {validation.errors.length > 5 && (
                    <p className="text-xs text-faint">…and {validation.errors.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}

          <PrimaryBtn
            onClick={handleSubmit}
            disabled={!validation?.ok || !title.trim() || !authorName.trim() || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit pack'}
          </PrimaryBtn>
        </>
      )}
    </PageShell>
  )
}
