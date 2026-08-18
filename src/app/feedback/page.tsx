'use client'

import { useRef, useState } from 'react'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { Message01Icon } from '@hugeicons/core-free-icons'
import { GAME_TYPE_CONFIG, GAME_TYPE_OPTIONS } from '@/lib/game-types'
import { useToast } from '@/components/ui/Toast'

type FeedbackCategory = 'bug' | 'feature' | 'improvement' | 'other'
type FeedbackGameType = 'general' | (typeof GAME_TYPE_OPTIONS)[number]

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string; emoji: string }[] = [
  { value: 'bug', label: 'Bug', emoji: '🐛' },
  { value: 'feature', label: 'Feature request', emoji: '✨' },
  { value: 'improvement', label: 'Improvement', emoji: '💡' },
  { value: 'other', label: 'Other', emoji: '💬' },
]

const GAME_OPTIONS: { value: FeedbackGameType; label: string }[] = GAME_TYPE_OPTIONS.map((id) => ({
  value: id,
  label: GAME_TYPE_CONFIG[id].label,
}))

function gameLabel(gt: FeedbackGameType): string {
  return gt === 'general' ? 'General / platform' : (GAME_TYPE_CONFIG[gt as keyof typeof GAME_TYPE_CONFIG]?.label ?? gt)
}

function GamePicker({ value, onChange }: { value: FeedbackGameType; onChange: (v: FeedbackGameType) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? GAME_OPTIONS.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : GAME_OPTIONS

  const pick = (v: FeedbackGameType) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange('general')
    setQuery('')
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        About which game?{' '}
        <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
          (optional)
        </span>
      </legend>

      {value !== 'general' ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white">
            {gameLabel(value)}
            <button
              type="button"
              onClick={clear}
              className="ml-0.5 opacity-80 hover:opacity-100"
              aria-label="Clear game selection"
            >
              ×
            </button>
          </span>
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search for a game or skip..."
            className="input-field w-full text-sm"
          />
          {open && filtered.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-bg,#fff)] shadow-lg">
              {filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(opt.value)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-inset-bg)] transition-colors"
                    style={{ color: 'var(--text)' }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

export default function FeedbackPage() {
  const { success, error } = useToast()
  const [gameType, setGameType] = useState<FeedbackGameType>('general')
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const canSubmit = category !== null && message.trim().length >= 10 && !submitting

  const handleSubmit = async () => {
    if (!category) {
      error('Please select a feedback type')
      return
    }
    if (message.trim().length < 10) {
      error('Please write at least 10 characters')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType,
          category,
          message: message.trim(),
          pageUrl: window.location.href,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send feedback')

      success('Thanks for the feedback!')
      setSent(true)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setGameType('general')
    setCategory(null)
    setMessage('')
    setSent(false)
  }

  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={Message01Icon} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Feedback
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Help us improve FateRound — bugs, ideas, and anything else.
            </p>
          </div>

          <div className="mx-auto max-w-xl">
            {sent ? (
              <div
                className="fr-gamecard cursor-default text-center"
                style={{ '--accent': '#10b981' } as React.CSSProperties}
              >
                <div className="space-y-3 py-4">
                  <p className="text-3xl">🎉</p>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                    Thanks for your feedback!
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    We read every submission and it helps us prioritise what to build next.
                  </p>
                  <button type="button" onClick={reset} className="btn-primary btn-fit mx-auto mt-4 px-5 py-2 text-sm">
                    Send another
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Category */}
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    What kind of feedback?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          category === opt.value
                            ? 'bg-[var(--primary)] text-white'
                            : 'border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Game type — searchable */}
                <GamePicker value={gameType} onChange={setGameType} />

                {/* Message */}
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Your feedback
                  </legend>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what happened, what you'd like to see, or anything else..."
                    rows={5}
                    maxLength={2000}
                    className="input-field w-full resize-none text-sm"
                  />
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {message.trim().length}/2000 · min 10 characters
                  </p>
                </fieldset>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="btn-primary w-full py-2.5 text-sm font-semibold"
                >
                  {submitting ? 'Sending...' : 'Send feedback'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
