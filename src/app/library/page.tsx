'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'

interface PackSummary {
  id: string
  title: string
  game_type: 'trivia' | 'would_you_rather' | 'most_likely_to'
  author_name: string
  description: string | null
  question_count: number
  approved_at: string
}

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  would_you_rather: 'Would You Rather',
  most_likely_to: 'Most Likely To',
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'trivia', label: 'Trivia' },
  { value: 'would_you_rather', label: 'Would You Rather' },
  { value: 'most_likely_to', label: 'Most Likely To' },
]

export default function LibraryPage() {
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = filter ? `/api/library?game_type=${filter}` : '/api/library'
    fetch(url)
      .then((r) => r.json())
      .then((d) => setPacks(d.packs ?? []))
      .finally(() => setLoading(false))
  }, [filter])

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-black tracking-tight gradient-title">Question Library</h1>
        <Link href="/library/submit" className="btn-secondary btn-fit px-4 py-2 text-sm no-underline">
          Submit a pack →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`chip ${filter === f.value ? 'chip-active' : ''} px-4`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading...</p>
      ) : packs.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-2">
          <p className="font-medium">No approved packs yet.</p>
          <p className="text-muted text-sm">Be the first to submit one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <div key={pack.id} className="glass-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold leading-tight truncate">{pack.title}</p>
                  <p className="text-muted text-sm">by {pack.author_name}</p>
                </div>
                <span className="label-caps chip px-3 py-1 shrink-0">
                  {GAME_TYPE_LABELS[pack.game_type] ?? pack.game_type}
                </span>
              </div>
              {pack.description && (
                <p className="text-muted text-sm line-clamp-2">{pack.description}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-faint text-xs">{pack.question_count} questions</span>
                <Link
                  href={`/create?pack=${pack.id}&game_type=${pack.game_type}`}
                  className="btn-secondary btn-fit px-3 py-1.5 text-sm no-underline"
                >
                  Use this pack
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
