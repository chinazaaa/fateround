'use client'

import { useEffect, useState } from 'react'

interface QuestionPack {
  id: string
  title: string
  game_type: string
  author_name: string
  description: string | null
  question_count: number
  questions: unknown[]
  status: string
  created_at: string
  approved_at: string | null
}

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  would_you_rather: 'Would You Rather',
  most_likely_to: 'Most Likely To',
}

const STATUSES = ['pending', 'approved', 'rejected'] as const
type Status = (typeof STATUSES)[number]

export default function AdminLibraryPage() {
  const [tab, setTab] = useState<Status>('pending')
  const [packs, setPacks] = useState<QuestionPack[]>([])
  const [loading, setLoading] = useState(true)

  const load = (status: Status) => {
    setLoading(true)
    fetch(`/api/admin/library?status=${status}`)
      .then((r) => r.json())
      .then((d) => setPacks(d.packs ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(tab) }, [tab])

  const action = async (id: string, act: 'approve' | 'reject') => {
    setPacks((prev) => prev.filter((p) => p.id !== id))
    await fetch(`/api/admin/library/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act }),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Question Library</h1>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === s ? 'chip-active' : 'text-muted hover:text-[var(--foreground)]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-muted text-sm">No {tab} packs.</p>
      ) : (
        <div className="space-y-4">
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} onAction={action} showActions={tab === 'pending'} />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({
  pack,
  onAction,
  showActions,
}: {
  pack: QuestionPack
  onAction: (id: string, act: 'approve' | 'reject') => void
  showActions: boolean
}) {
  const preview = (pack.questions as unknown[]).slice(0, 5)

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="font-semibold truncate">{pack.title}</p>
          <p className="text-muted text-sm">by {pack.author_name}</p>
        </div>
        <span className="label-caps chip px-3 py-1 shrink-0">
          {GAME_TYPE_LABELS[pack.game_type] ?? pack.game_type}
        </span>
      </div>

      {pack.description && <p className="text-muted text-sm">{pack.description}</p>}

      <div className="flex gap-4 text-xs text-faint">
        <span>{pack.question_count} questions</span>
        <span>Submitted {new Date(pack.created_at).toLocaleDateString()}</span>
      </div>

      {preview.length > 0 && (
        <div className="space-y-1.5">
          <p className="label-caps text-muted">Preview</p>
          {preview.map((q, i) => (
            <p key={i} className="text-sm text-muted truncate">
              {previewText(pack.game_type, q)}
            </p>
          ))}
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onAction(pack.id, 'approve')}
            className="btn-primary btn-fit px-4 py-2 text-sm"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction(pack.id, 'reject')}
            className="btn-secondary btn-fit px-4 py-2 text-sm"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function previewText(gameType: string, q: unknown): string {
  if (!q || typeof q !== 'object') return String(q)
  const obj = q as Record<string, unknown>
  if (gameType === 'trivia') return String(obj.question ?? '')
  if (gameType === 'would_you_rather') return `${obj.optionA} or ${obj.optionB}`
  if (gameType === 'most_likely_to') return String(q)
  return JSON.stringify(q)
}
