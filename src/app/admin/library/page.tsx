'use client'

import { useEffect, useState } from 'react'
import { Chip } from '@/components/ui/PageShell'

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
  tags: string[]
}

const GAME_TYPE_META: Record<string, { label: string; color: string }> = {
  trivia: { label: 'Trivia', color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25' },
  would_you_rather: {
    label: 'Would You Rather',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',
  },
  most_likely_to: {
    label: 'Most Likely To',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  this_or_that: {
    label: 'This or That',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/25',
  },
  never_have_i_ever: {
    label: 'Never Have I Ever',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25',
  },
  describe_it: {
    label: 'Text Charades',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
  },
  codewords: {
    label: 'Codewords',
    color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25',
  },
  pick_a_number: {
    label: 'Pick a Number',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  },
}

const TAG_META: Record<string, { label: string; color: string }> = {
  easy: { label: 'Easy', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  intermediate: { label: 'Intermediate', color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25' },
  advanced: { label: 'Advanced', color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25' },
  'family-friendly': { label: 'Family', color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25' },
  '18+': { label: '18+', color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/25' },
  party: { label: 'Party', color: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/25' },
  spicy: { label: 'Spicy', color: 'text-red-500 dark:text-red-300 bg-red-500/10 border-red-500/25' },
}

const ALL_TAGS = ['easy', 'intermediate', 'advanced', 'family-friendly', '18+', 'party', 'spicy']
const ALL_GAME_TYPES = [
  'trivia',
  'would_you_rather',
  'most_likely_to',
  'this_or_that',
  'never_have_i_ever',
  'describe_it',
  'codewords',
  'pick_a_number',
]
const ALL_STATUSES = ['pending', 'approved', 'rejected']
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

  useEffect(() => {
    load(tab)
  }, [tab])

  const handleAction = async (id: string, act: 'approve' | 'reject') => {
    setPacks((prev) => prev.filter((p) => p.id !== id))
    await fetch(`/api/admin/library/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act }),
    })
  }

  const handleSave = (updated: QuestionPack) => {
    setPacks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Question Library</h1>
        <p className="text-muted text-sm mt-1">Review and approve community-submitted packs</p>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Chip key={s} active={tab === s} onClick={() => setTab(s)}>
            <span className="capitalize">{s}</span>
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse space-y-3">
              <div className="h-4 bg-[var(--border-strong)] rounded-full w-1/2" />
              <div className="h-3 bg-[var(--border)] rounded-full w-1/3" />
              <div className="h-3 bg-[var(--border)] rounded-full w-2/3" />
            </div>
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-muted text-sm">No {tab} packs.</p>
        </div>
      ) : (
        <div className="space-y-4 animate-stagger">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onAction={handleAction}
              onSave={handleSave}
              showActions={tab === 'pending'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({
  pack,
  onAction,
  onSave,
  showActions,
}: {
  pack: QuestionPack
  onAction: (id: string, act: 'approve' | 'reject') => void
  onSave: (updated: QuestionPack) => void
  showActions: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [title, setTitle] = useState(pack.title)
  const [authorName, setAuthorName] = useState(pack.author_name)
  const [gameType, setGameType] = useState(pack.game_type)
  const [description, setDescription] = useState(pack.description ?? '')
  const [tags, setTags] = useState<string[]>(pack.tags ?? [])
  const [status, setStatus] = useState(pack.status)

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/library/${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          author_name: authorName,
          game_type: gameType,
          description: description || null,
          tags,
          status,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSave({
        ...pack,
        title,
        author_name: authorName,
        game_type: gameType,
        description: description || null,
        tags,
        status,
      })
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setTitle(pack.title)
    setAuthorName(pack.author_name)
    setGameType(pack.game_type)
    setDescription(pack.description ?? '')
    setTags(pack.tags ?? [])
    setStatus(pack.status)
    setSaveError(null)
    setEditing(false)
  }

  const preview = (pack.questions as unknown[]).slice(0, 5)
  const meta = GAME_TYPE_META[pack.game_type]

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="font-bold leading-snug">{pack.title}</p>
          <p className="text-muted text-sm">by {pack.author_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`label-caps rounded-full border px-2.5 py-1 text-[10px] ${meta?.color ?? 'chip'}`}>
            {meta?.label ?? pack.game_type}
          </span>
          <button
            type="button"
            onClick={() => (editing ? handleCancel() : setEditing(true))}
            className="btn-secondary btn-fit px-3 py-1 text-xs"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {pack.description && !editing && <p className="text-muted text-sm leading-relaxed">{pack.description}</p>}

      {(pack.tags ?? []).length > 0 && !editing && (
        <div className="flex flex-wrap gap-1.5">
          {(pack.tags ?? []).map((t) => {
            const tm = TAG_META[t]
            return (
              <span
                key={t}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${tm?.color ?? 'chip'}`}
              >
                {tm?.label ?? t}
              </span>
            )
          })}
        </div>
      )}

      {editing && (
        <div className="surface-inset px-4 py-4 space-y-4">
          <p className="label-caps text-faint">Edit pack details</p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="input-field w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Author name</label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={60}
              className="input-field w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="input-field w-full resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted">Game type</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_GAME_TYPES.map((gt) => {
                const m = GAME_TYPE_META[gt]
                return (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setGameType(gt)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      gameType === gt
                        ? `${m?.color ?? ''} border-current`
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {m?.label ?? gt}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted">Tags</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_TAGS.map((t) => {
                const tm = TAG_META[t]
                const active = tags.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? `${tm?.color ?? ''} border-current`
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {tm?.label ?? t}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted">Status</label>
            <div className="flex gap-2">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all ${
                    status === s
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {saveError && <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !authorName.trim()}
            className="btn-primary btn-fit px-5 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <div className="flex gap-4 text-xs text-faint">
        <span>{pack.question_count} questions</span>
        <span>Submitted {new Date(pack.created_at).toLocaleDateString()}</span>
        {pack.approved_at && <span>Approved {new Date(pack.approved_at).toLocaleDateString()}</span>}
      </div>

      {preview.length > 0 && (
        <div className="surface-inset px-4 py-3 space-y-2">
          <p className="label-caps text-faint">Preview</p>
          <div className="space-y-1.5">
            {preview.map((q, i) => (
              <p key={i} className="text-xs text-muted truncate leading-relaxed">
                {i + 1}. {previewText(pack.game_type, q)}
              </p>
            ))}
          </div>
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => onAction(pack.id, 'approve')}
            className="btn-primary btn-fit px-5 py-2 text-sm"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction(pack.id, 'reject')}
            className="btn-secondary btn-fit px-5 py-2 text-sm"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function previewText(gameType: string, q: unknown): string {
  if (typeof q === 'string') return q
  if (!q || typeof q !== 'object') return String(q)
  const obj = q as Record<string, unknown>
  if (gameType === 'trivia') return String(obj.question ?? '')
  if (gameType === 'would_you_rather' || gameType === 'this_or_that') return `${obj.optionA} or ${obj.optionB}`
  return JSON.stringify(q)
}
