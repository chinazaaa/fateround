'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chip } from '@/components/ui/PageShell'
import { MAX_PRICE_COINS } from '@/lib/coins/pricing'
import {
  QUESTION_PACK_GAME_TYPE_META,
  QUESTION_PACK_GAME_TYPE_ORDER,
  questionPackGameTypeMeta,
} from '@/lib/question-pack-game-type-meta'
import { previewText } from '@/lib/question-pack-preview'

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
  price_coins: number
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
  const [questionsJson, setQuestionsJson] = useState(() => JSON.stringify(pack.questions ?? [], null, 2))
  // Shop price. 0 = free (default / grandfathered). > 0 = premium; the shop
  // catalog surfaces it and players pay coins to unlock.
  const [priceCoins, setPriceCoins] = useState<string>(String(pack.price_coins ?? 0))

  // Collection membership (loaded when the editor opens). null = not yet loaded.
  const [allCollections, setAllCollections] = useState<{ id: string; name: string; is_active: boolean }[] | null>(null)
  const [collectionIds, setCollectionIds] = useState<string[]>([])

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const toggleCollection = (id: string) =>
    setCollectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // Lazy-load collections + this pack's membership the first time the editor opens.
  useEffect(() => {
    if (!editing || allCollections !== null) return
    fetch(`/api/admin/library/${pack.id}/collections`)
      .then((r) => r.json())
      .then((d) => {
        setAllCollections(d.collections ?? [])
        setCollectionIds(d.collectionIds ?? [])
      })
      .catch(() => setAllCollections([]))
  }, [editing, allCollections, pack.id])

  // Live-parse the questions editor so we can show a count / error and gate saving.
  const parsedQuestions = useMemo<{ ok: true; value: unknown[] } | { ok: false; error: string }>(() => {
    try {
      const value = JSON.parse(questionsJson)
      if (!Array.isArray(value)) return { ok: false, error: 'Must be a JSON array of question rows' }
      if (value.length === 0) return { ok: false, error: 'At least one question is required' }
      return { ok: true, value }
    } catch {
      return { ok: false, error: 'Invalid JSON — check for a trailing comma or missing bracket' }
    }
  }, [questionsJson])

  const handleSave = async () => {
    if (!parsedQuestions.ok) {
      setSaveError(parsedQuestions.error)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const nextQuestions = parsedQuestions.value
      const parsedPrice = priceCoins === '' ? 0 : Number(priceCoins)
      if (
        !Number.isFinite(parsedPrice) ||
        !Number.isInteger(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > MAX_PRICE_COINS
      ) {
        setSaveError(`Price must be an integer between 0 and ${MAX_PRICE_COINS} (0 for free).`)
        return
      }
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
          questions: nextQuestions,
          price_coins: parsedPrice,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      // Persist collection membership alongside the pack edit (only if the editor loaded it).
      if (allCollections !== null) {
        const cRes = await fetch(`/api/admin/library/${pack.id}/collections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection_ids: collectionIds }),
        })
        if (!cRes.ok) {
          const cData = await cRes.json().catch(() => ({}))
          throw new Error(cData.error ?? 'Saved pack, but collections failed')
        }
      }
      onSave({
        ...pack,
        title,
        author_name: authorName,
        game_type: gameType,
        description: description || null,
        tags,
        status,
        questions: nextQuestions,
        question_count: nextQuestions.length,
        price_coins: parsedPrice,
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
    setQuestionsJson(JSON.stringify(pack.questions ?? [], null, 2))
    setPriceCoins(String(pack.price_coins ?? 0))
    // Drop loaded collection state so re-opening re-fetches the current membership.
    setAllCollections(null)
    setCollectionIds([])
    setSaveError(null)
    setEditing(false)
  }

  const preview = (pack.questions as unknown[]).slice(0, 5)
  const meta = questionPackGameTypeMeta(pack.game_type)

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="font-bold leading-snug">{pack.title}</p>
          <p className="text-muted text-sm">by {pack.author_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pack.price_coins > 0 && (
            <span className="label-caps rounded-full border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--primary)]">
              🪙 {pack.price_coins}
            </span>
          )}
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
              {QUESTION_PACK_GAME_TYPE_ORDER.map((gt) => {
                // Indexed directly, not through `questionPackGameTypeMeta`: `gt` comes from the
                // order array, which the meta is exhaustive over by construction. A `?? gt`
                // fallback here would re-admit the raw-slug rendering this PR removes. The badge
                // above still goes through the helper — `pack.game_type` is off the wire.
                const m = QUESTION_PACK_GAME_TYPE_META[gt]
                return (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setGameType(gt)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      gameType === gt
                        ? `${m.color} border-current`
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {m.label}
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
            <label className="text-xs font-medium text-muted">Collections</label>
            {allCollections === null ? (
              <p className="text-faint text-[10px]">Loading…</p>
            ) : allCollections.length === 0 ? (
              <p className="text-faint text-[10px]">
                No collections yet — create one in{' '}
                <a href="/admin/collections" className="underline">
                  Collections
                </a>
                .
              </p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {allCollections.map((c) => {
                  const active = collectionIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCollection(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {c.name}
                      {!c.is_active ? ' (hidden)' : ''}
                    </button>
                  )
                })}
              </div>
            )}
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

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Shop price (coins)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={priceCoins}
              onChange={(e) => setPriceCoins(e.target.value)}
              className="input-field w-40"
              placeholder="0"
            />
            <p className="text-faint text-[10px]">
              0 = free (grandfathered / default). Above 0 lists this pack in the coin shop; players pay to unlock.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted">Questions</label>
              <span className={`text-[10px] ${parsedQuestions.ok ? 'text-faint' : 'text-red-500 dark:text-red-400'}`}>
                {parsedQuestions.ok ? `${parsedQuestions.value.length} rows` : parsedQuestions.error}
              </span>
            </div>
            <textarea
              value={questionsJson}
              onChange={(e) => setQuestionsJson(e.target.value)}
              rows={12}
              spellCheck={false}
              className={`input-field w-full resize-y font-mono text-xs leading-relaxed ${
                parsedQuestions.ok ? '' : 'border-red-500/50'
              }`}
            />
            <p className="text-faint text-[10px]">
              Each row is one question. Edit, add, or remove entries directly — the shape must match this game type.
            </p>
          </div>

          {saveError && <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !authorName.trim() || !parsedQuestions.ok}
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
