'use client'

import { useEffect, useState } from 'react'
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
const GAME_FILTERS = ['all', 'general', ...Object.keys(GAME_TYPE_CONFIG)] as const

function formatGameType(type: string): string {
  if (type === 'general') return 'General'
  return GAME_TYPE_CONFIG[type as keyof typeof GAME_TYPE_CONFIG]?.label ?? type
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>('all')
  const [gameType, setGameType] = useState<(typeof GAME_FILTERS)[number]>('all')
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
            {CATEGORY_FILTERS.map((value) => (
              <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
                {value === 'all' ? 'All' : value}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-muted text-sm font-medium mb-2">Game</p>
          <div className="flex flex-wrap gap-2">
            {GAME_FILTERS.map((value) => (
              <Chip key={value} active={gameType === value} onClick={() => setGameType(value)}>
                {value === 'all' ? 'All' : formatGameType(value)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="text-muted">Loading feedback…</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <div className="glass-card-strong overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
            <h2 className="font-bold">Submissions</h2>
            <span className="text-muted text-sm">{feedback.length} shown</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {feedback.length === 0 ? (
              <p className="px-5 py-10 text-center text-muted">No feedback yet</p>
            ) : (
              feedback.map((item) => (
                <article key={item.id} className="px-5 py-5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="chip chip-active capitalize">{item.category}</span>
                    <span className="chip">{formatGameType(item.game_type)}</span>
                    <span className="text-faint">{formatDate(item.created_at)}</span>
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
