'use client'

import { useState } from 'react'
import type { AiQuestionGameType } from '@/lib/ai-questions'
import type { TriviaCategory } from '@/types'

type Props = {
  gameType: AiQuestionGameType
  /** Default trivia category for generated questions (trivia only). */
  triviaCategory?: TriviaCategory
  /** Noun shown in the UI, e.g. "questions" or "words". */
  noun?: string
  defaultCount?: number
  maxCount?: number
  /** Called with the generated items, already in the game's custom-question storage shape. */
  onGenerated: (questions: unknown[]) => void
  accent?: string
}

export function AiQuestionsGenerator({
  gameType,
  triviaCategory,
  noun = 'questions',
  defaultCount = 20,
  maxCount = 50,
  onGenerated,
  accent,
}: Props) {
  const [count, setCount] = useState(Math.max(1, Math.min(maxCount, defaultCount)))
  const [theme, setTheme] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)

  const inputClass = 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-body'

  async function handleGenerate() {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType,
          count,
          ...(theme.trim() ? { theme: theme.trim() } : {}),
          ...(customPrompt.trim() ? { customPrompt: customPrompt.trim() } : {}),
          ...(triviaCategory ? { triviaCategory } : {}),
          apiKey: trimmedKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate')
        return
      }
      const questions = Array.isArray(data.questions) ? data.questions : []
      onGenerated(questions)
      setLastCount(questions.length)
    } catch {
      setError('Failed to generate. Check your connection and try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-theme p-4 space-y-3"
      style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
    >
      <label className="block space-y-1">
        <span className="text-muted text-xs uppercase tracking-wider">How many {noun}?</span>
        <input
          type="number"
          min={1}
          max={maxCount}
          className={inputClass}
          value={count}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10)
            if (Number.isNaN(n)) return
            setCount(Math.max(1, Math.min(maxCount, n)))
          }}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-muted text-xs uppercase tracking-wider">Theme (optional)</span>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. 90s movies, our office, a birthday party"
          maxLength={100}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-muted text-xs uppercase tracking-wider">Extra instructions (optional)</span>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          maxLength={500}
          placeholder="e.g. Keep it family-friendly and reference hiking"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-muted text-xs uppercase tracking-wider">Your Claude API key (required)</span>
        <input
          type="password"
          className={inputClass}
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <span className="block text-faint text-xs">
          Generation runs on your own Claude API key, so you only pay for what you use. Your key is never stored.
        </span>
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {lastCount !== null && !error && (
        <p className="text-emerald-400 text-sm">
          Generated {lastCount} {noun}. Generate again to replace them.
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !apiKey.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-40"
      >
        {generating ? 'Generating…' : lastCount !== null ? 'Re-generate' : `Generate ${noun} with AI`}
      </button>
    </div>
  )
}
