'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { platformGameList, type PlatformGameMeta } from '@/lib/platform-content'

type Batch = {
  id: string
  game_type: string
  variant: string | null
  label: string
  entry_count: number
  is_active: boolean
  sort_order: number
  builtin_key: string | null
  created_at: string
  updated_at: string
}

const GAMES = platformGameList()

function statsLine(count: number, stats: { skippedRows: number; duplicateRows: number } | null): string {
  if (!stats) return `${count} entries`
  const bits = [`${count} entries`]
  if (stats.duplicateRows) bits.push(`${stats.duplicateRows} duplicates skipped`)
  if (stats.skippedRows) bits.push(`${stats.skippedRows} blank skipped`)
  return bits.join(' · ')
}

export default function AdminPlatformContentPage() {
  const [game, setGame] = useState<PlatformGameMeta>(GAMES[0])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/platform-content?game_type=${game.gameType}`)
      const json = await res.json()
      setBatches(((json.batches ?? []) as Batch[]).filter((b) => (b.variant ?? null) === (game.variant ?? null)))
    } finally {
      setLoading(false)
    }
  }, [game])

  useEffect(() => {
    load()
  }, [load])

  const importBuiltins = async () => {
    setImportMsg(null)
    const res = await fetch('/api/admin/platform-content/import-builtins', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setImportMsg(json.error ?? 'Import failed')
      return
    }
    setImportMsg(`Imported ${json.inserted} built-in batch(es), ${json.skipped} already present`)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Platform content</h1>
          <p className="text-muted text-sm mt-1">
            Editable question/word banks for the <strong>platform</strong> source. Games draw from active batches; if
            none exist they fall back to the built-in list.
          </p>
        </div>
        <button type="button" onClick={importBuiltins} className="btn-secondary px-4 py-2 text-sm">
          Import built-ins
        </button>
      </div>
      {importMsg && <p className="text-sm text-[var(--muted)]">{importMsg}</p>}

      <div className="flex flex-wrap gap-2">
        {GAMES.map((g) => {
          const active = g.gameType === game.gameType && (g.variant ?? null) === (game.variant ?? null)
          return (
            <button
              key={`${g.gameType}:${g.variant ?? ''}`}
              type="button"
              onClick={() => setGame(g)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
              }`}
            >
              {g.label}
              {g.variant ? ` · ${g.variant}` : ''}
            </button>
          )
        })}
      </div>

      <CreateBatchForm game={game} onCreated={load} />

      <div className="space-y-2">
        <h2 className="label-caps text-faint">{game.label} batches</h2>
        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="text-muted text-sm">
            No batches yet — click “Import built-ins” to seed the current defaults, or add one below.
          </p>
        ) : (
          batches.map((b) => <BatchRow key={b.id} batch={b} onChanged={load} />)
        )}
      </div>
    </div>
  )
}

function CreateBatchForm({ game, onCreated }: { game: PlatformGameMeta; onCreated: () => void }) {
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const create = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/platform-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: game.gameType, variant: game.variant, label, content }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMsg(json.error ?? 'Could not create')
        return
      }
      setMsg(`Created “${json.batch.label}” — ${statsLine(json.batch.entry_count, json.stats)}`)
      setLabel('')
      setContent('')
      if (fileRef.current) fileRef.current.value = ''
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setContent(await file.text())
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <p className="label-caps text-faint">New {game.label} batch</p>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Batch name (admin-only)</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder={`e.g. ${game.label} — Extra`}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="font-semibold">Content ({game.columns})</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-[var(--primary)]">
              ⬆ Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={onFile}
              className="hidden"
            />
          </span>
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Paste or upload — one per line"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
        />
      </label>
      {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
      <button
        type="button"
        disabled={busy || !label.trim() || !content.trim()}
        onClick={create}
        className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add batch'}
      </button>
    </div>
  )
}

function BatchRow({ batch, onChanged }: { batch: Batch; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(batch.label)
  const [content, setContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openEdit = async () => {
    setEditing(true)
    setError(null)
    setLoadingContent(true)
    try {
      const res = await fetch(`/api/admin/platform-content/${batch.id}`)
      const json = await res.json()
      setContent(json.text ?? '')
    } catch {
      setError('Could not load the current entries — you can still paste a new list to replace them.')
    } finally {
      setLoadingContent(false)
    }
  }

  const closeEdit = () => {
    setEditing(false)
    setContent('')
    setLabel(batch.label)
    setError(null)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { label }
      if (content.trim()) body.content = content
      const res = await fetch(`/api/admin/platform-content/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not save')
        return
      }
      setEditing(false)
      setContent('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    try {
      await fetch(`/api/admin/platform-content/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !batch.is_active }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    if (!confirm(`Delete batch “${batch.label}”? Games already started are unaffected.`)) return
    setBusy(true)
    try {
      await fetch(`/api/admin/platform-content/${batch.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{batch.label}</span>
          {batch.builtin_key && (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
              built-in
            </span>
          )}
          <span className="ml-2 text-xs text-[var(--muted)]">{batch.entry_count} entries</span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              batch.is_active
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'border border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {batch.is_active ? 'active' : 'hidden'}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={toggleActive} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
            {batch.is_active ? 'Hide' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => (editing ? closeEdit() : openEdit())}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button type="button" onClick={del} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-red-500">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Batch name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">Entries</span>
              <span className="text-xs font-normal text-[var(--muted)]">Edit a line to add or remove</span>
            </span>
            <textarea
              value={loadingContent ? 'Loading current entries…' : content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loadingContent}
              rows={10}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs disabled:opacity-60"
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  )
}
