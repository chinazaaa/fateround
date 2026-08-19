'use client'

import { useCallback, useEffect, useState } from 'react'

type Collection = {
  id: string
  slug: string
  name: string
  description: string | null
  audience: string | null
  icon: string | null
  is_active: boolean
  sort_order: number
  builtin_key: string | null
  pack_count: number
}

type PackMeta = {
  id: string
  title: string
  game_type: string
  author_name: string
  question_count: number
  status?: string
}

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/collections')
      const json = await res.json()
      setCollections((json.collections ?? []) as Collection[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const importBuiltins = async () => {
    setImportMsg(null)
    const res = await fetch('/api/admin/collections/import-builtins', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setImportMsg(json.error ?? 'Import failed')
      return
    }
    setImportMsg(
      `Imported ${json.collectionsCreated} collection(s), ${json.datasetsCreated} dataset(s), ${json.linksCreated} link(s)`
    )
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Collections</h1>
          <p className="text-muted text-sm mt-1">
            Themed groups of Library datasets (e.g. <strong>Church &amp; youth</strong>) shown on{' '}
            <code>/collections</code> and as a filter when hosts create a game. Add existing approved Library packs to a
            collection — the game engine never changes, only the dataset.
          </p>
        </div>
        <button type="button" onClick={importBuiltins} className="btn-secondary px-4 py-2 text-sm">
          Import built-ins
        </button>
      </div>
      {importMsg && <p className="text-sm text-[var(--muted)]">{importMsg}</p>}

      <CreateCollectionForm onCreated={load} />

      <div className="space-y-2">
        <h2 className="label-caps text-faint">All collections</h2>
        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="text-muted text-sm">
            No collections yet — click “Import built-ins” to seed the pilot Church collection, or add one below.
          </p>
        ) : (
          collections.map((c) => <CollectionRow key={c.id} collection={c} onChanged={load} />)
        )}
      </div>
    </div>
  )
}

function CreateCollectionForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [audience, setAudience] = useState('')
  const [icon, setIcon] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug: slug || undefined, audience, icon, description }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMsg(json.error ?? 'Could not create')
        return
      }
      setMsg(`Created “${json.collection.name}” (/collections/${json.collection.slug})`)
      setName('')
      setSlug('')
      setAudience('')
      setIcon('')
      setDescription('')
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <p className="label-caps text-faint">New collection</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Church & youth group games"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">
            Slug <span className="font-normal text-[var(--muted)]">(optional — from name)</span>
          </span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={60}
            placeholder="church"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Audience label</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={60}
            placeholder="Church & youth"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Icon (emoji)</span>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={16}
            placeholder="⛪"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Shown on the collection page and create filter."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        />
      </label>
      {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={create}
        className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add collection'}
      </button>
    </div>
  )
}

function CollectionRow({ collection, onChanged }: { collection: Collection; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(collection.name)
  const [slug, setSlug] = useState(collection.slug)
  const [audience, setAudience] = useState(collection.audience ?? '')
  const [icon, setIcon] = useState(collection.icon ?? '')
  const [description, setDescription] = useState(collection.description ?? '')
  const [members, setMembers] = useState<PackMeta[]>([])
  const [allPacks, setAllPacks] = useState<PackMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openEdit = async () => {
    setEditing(true)
    setError(null)
    try {
      const [detailRes, packsRes] = await Promise.all([
        fetch(`/api/admin/collections/${collection.id}`),
        fetch('/api/admin/library?status=approved'),
      ])
      const detail = await detailRes.json()
      const packs = await packsRes.json()
      setMembers((detail.packs ?? []) as PackMeta[])
      setAllPacks((packs.packs ?? []) as PackMeta[])
    } catch {
      setError('Could not load the collection details.')
    }
  }

  const closeEdit = () => {
    setEditing(false)
    setError(null)
    setName(collection.name)
    setSlug(collection.slug)
    setAudience(collection.audience ?? '')
    setIcon(collection.icon ?? '')
    setDescription(collection.description ?? '')
  }

  const saveMeta = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, audience, icon, description }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not save')
        return
      }
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    try {
      await fetch(`/api/admin/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !collection.is_active }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    if (!confirm(`Delete collection “${collection.name}”? The datasets themselves are kept.`)) return
    setBusy(true)
    try {
      await fetch(`/api/admin/collections/${collection.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const addPack = async (packId: string) => {
    if (!packId) return
    setBusy(true)
    try {
      await fetch(`/api/admin/collections/${collection.id}/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      })
      await openEdit()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const removePack = async (packId: string) => {
    setBusy(true)
    try {
      await fetch(`/api/admin/collections/${collection.id}/packs?pack_id=${packId}`, { method: 'DELETE' })
      await openEdit()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const memberIds = new Set(members.map((m) => m.id))
  const available = allPacks.filter((p) => !memberIds.has(p.id))

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {collection.icon && <span className="mr-1">{collection.icon}</span>}
          <span className="font-semibold">{collection.name}</span>
          <span className="ml-2 font-mono text-xs text-[var(--muted)]">/{collection.slug}</span>
          {collection.builtin_key && (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
              built-in
            </span>
          )}
          <span className="ml-2 text-xs text-[var(--muted)]">{collection.pack_count} datasets</span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              collection.is_active
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'border border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {collection.is_active ? 'active' : 'hidden'}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={toggleActive} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
            {collection.is_active ? 'Hide' : 'Activate'}
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
        <div className="mt-3 space-y-4 border-t border-[var(--border)] pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Slug</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Audience label</span>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Icon (emoji)</span>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={16}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={saveMeta}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save details'}
          </button>

          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <p className="label-caps text-faint">Datasets in this collection</p>
            {members.length === 0 ? (
              <p className="text-muted text-sm">None yet — add an approved Library pack below.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold">{m.title}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {m.game_type} · {m.question_count} items
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removePack(m.id)}
                      disabled={busy}
                      className="btn-ghost px-2 py-1 text-xs text-red-500"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Add a dataset</span>
              <select
                value=""
                onChange={(e) => addPack(e.target.value)}
                disabled={busy || available.length === 0}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {available.length === 0 ? 'No more approved packs' : 'Select an approved pack…'}
                </option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {p.game_type} ({p.question_count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
