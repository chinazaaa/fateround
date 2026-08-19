'use client'

import { useEffect, useRef, useState } from 'react'
import { Chip } from '@/components/ui/PageShell'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'

type FeedbackItem = {
  id: string
  game_type: string
  category: string
  message: string
  page_url: string | null
  created_at: string
}

const CATEGORY_FILTERS = ['all', 'bug', 'feature', 'improvement', 'other'] as const

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  all: { emoji: '', label: 'All' },
  bug: { emoji: '🐛', label: 'Bugs' },
  feature: { emoji: '✨', label: 'Features' },
  improvement: { emoji: '💡', label: 'Improvements' },
  other: { emoji: '💬', label: 'Other' },
}

type GameFilterValue = 'all' | string

function formatGameType(type: string): string {
  if (type === 'general') return 'General'
  return GAME_TYPE_CONFIG[type as keyof typeof GAME_TYPE_CONFIG]?.label ?? type
}

function relativeDate(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function GameFilterPicker({
  value,
  onChange,
  options,
}: {
  value: GameFilterValue
  onChange: (v: GameFilterValue) => void
  options: { value: string; label: string }[]
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const allOptions = [{ value: 'all', label: 'All games' }, ...options]

  const filtered = query.trim()
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : allOptions

  const pick = (v: GameFilterValue) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  const selectedLabel = allOptions.find((o) => o.value === value)?.label ?? 'All games'

  if (options.length === 0) return null

  return (
    <div>
      <p className="text-muted text-sm font-medium mb-2">Game</p>
      {value !== 'all' ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white">
            {selectedLabel}
            <button
              type="button"
              onClick={() => pick('all')}
              className="ml-0.5 opacity-80 hover:opacity-100"
              aria-label="Clear game filter"
            >
              ×
            </button>
          </span>
        </div>
      ) : (
        <div ref={wrapRef} className="relative max-w-xs">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Filter by game..."
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
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [availableGames, setAvailableGames] = useState<{ value: string; label: string }[]>([])
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>('all')
  const [gameType, setGameType] = useState<GameFilterValue>('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (gameType !== 'all') params.set('gameType', gameType)

    fetch(`/api/admin/feedback?${params}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load feedback')
        setFeedback(data.feedback ?? [])
        if (Array.isArray(data.gameTypes)) {
          setAvailableGames(data.gameTypes.map((gt: string) => ({ value: gt, label: formatGameType(gt) })))
        }
        setError('')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load feedback')
        setFeedback([])
      })
      .finally(() => setLoading(false))
  }, [category, gameType])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Feedback</h1>
        <p className="text-muted text-sm mt-1">User-submitted bugs, features, and suggestions</p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-muted text-sm font-medium mb-2">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((value) => {
              const meta = CATEGORY_META[value]
              return (
                <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
                  {meta.emoji ? `${meta.emoji} ` : ''}
                  {meta.label}
                </Chip>
              )
            })}
          </div>
        </div>

        <GameFilterPicker value={gameType} onChange={setGameType} options={availableGames} />
      </div>

      {loading && <p className="text-muted">Loading feedback...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <div className="glass-card-strong overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
            <h2 className="font-bold">Submissions</h2>
            <span className="text-muted text-sm">
              {feedback.length} result{feedback.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {feedback.length === 0 ? (
              <p className="px-5 py-10 text-center text-muted">No feedback matching these filters.</p>
            ) : (
              feedback.map((item) => {
                const meta = CATEGORY_META[item.category]
                return (
                  <article
                    key={item.id}
                    className="px-5 py-4 space-y-2 hover:bg-[var(--surface-inset-bg)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="chip chip-active capitalize">
                          {meta?.emoji ? `${meta.emoji} ` : ''}
                          {item.category}
                        </span>
                        <span className="chip">{formatGameType(item.game_type)}</span>
                      </div>
                      <span className="text-faint text-xs shrink-0" title={new Date(item.created_at).toLocaleString()}>
                        {relativeDate(item.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.message}</p>
                    {item.page_url && (
                      <a
                        href={item.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--primary)] hover:underline break-all"
                      >
                        {item.page_url}
                      </a>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
