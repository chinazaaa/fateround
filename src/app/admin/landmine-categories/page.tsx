'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { landmineCategoryWordsToText, LANDMINE_CATEGORY_MIN_ENTRIES } from '@/lib/landmine-categories'

type Category = {
  id: string
  name: string
  entry_count: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type ImportStats = { totalRows: number; skippedRows: number; duplicateRows: number } | null

function statsLine(count: number, stats: ImportStats): string {
  if (!stats) return `${count} words`
  const bits = [`${count} words`]
  if (stats.duplicateRows) bits.push(`${stats.duplicateRows} duplicates skipped`)
  if (stats.skippedRows) bits.push(`${stats.skippedRows} skipped`)
  return bits.join(' · ')
}

export default function AdminLandmineCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/landmine-categories')
      const json = await res.json()
      setCategories(res.ok ? (json.categories ?? []) : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Landmine categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Word pools for the Landmine party game. Each round the caller picks a category and the system secretly plants
          one of its words as the mine. List the most obvious answers first — the mine draw is weighted toward the top
          of the list. Players only ever see the category name, never the words.
        </p>
      </div>

      <CreateCategoryForm onCreated={load} />

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Categories</h2>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No categories yet — create one above.</p>
        ) : (
          categories.map((c) => <CategoryRow key={c.id} category={c} onChanged={load} />)
        )}
      </div>
    </div>
  )
}

function WordsField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    onChange(await file.text())
  }

  return (
    <div className="text-sm">
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary px-3 py-1.5 text-sm">
          ⬆ Upload file
        </button>
        {fileName ? (
          <span className="text-xs text-[var(--muted)]">{fileName}</span>
        ) : (
          <span className="text-xs text-[var(--muted)]">
            or type/paste below — one word per line (or comma-separated)
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
      />
    </div>
  )
}

function CreateCategoryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const res = await fetch('/api/admin/landmine-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, words }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not create category')
        return
      }
      setOkMsg(`Created “${json.category.name}” — ${statsLine(json.category.entry_count, json.stats ?? null)}`)
      setName('')
      setWords('')
      onCreated()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = name.trim().length > 0 && words.trim().length > 0 && !busy

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">New category</h2>
      <label className="mt-3 block text-sm sm:max-w-sm">
        <span className="mb-1 block font-semibold">Category name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Things found in school"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-sm font-semibold">
          Words (most obvious first — the mine is weighted to the top)
        </span>
        <WordsField value={words} onChange={setWords} placeholder={'pencil\npen\nbook\ndesk\nteacher\n…'} />
        <p className="mt-1 text-xs text-[var(--muted)]">
          At least {LANDMINE_CATEGORY_MIN_ENTRIES} words. Duplicates are removed automatically.
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {okMsg && <p className="mt-2 text-sm text-emerald-500">{okMsg}</p>}

      <div className="mt-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create category'}
        </button>
      </div>
    </div>
  )
}

function CategoryRow({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [words, setWords] = useState('')
  const [loadedWords, setLoadedWords] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openEdit = async () => {
    if (editing) {
      setEditing(false)
      return
    }
    setEditing(true)
    setError(null)
    if (!loadedWords) {
      try {
        const res = await fetch(`/api/admin/landmine-categories/${category.id}`)
        const json = await res.json()
        if (res.ok) {
          setWords(landmineCategoryWordsToText(json.category?.entries))
          setLoadedWords(true)
        }
      } catch {
        // Leave the field empty; saving with blank words keeps the current pool (words omitted).
      }
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name }
      // Only send words if we actually loaded/edited them, so an accidental blank doesn't wipe the pool.
      if (loadedWords && words.trim()) body.words = words
      const res = await fetch(`/api/admin/landmine-categories/${category.id}`, {
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
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    setBusy(true)
    try {
      await fetch(`/api/admin/landmine-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !category.is_active }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    if (!confirm(`Delete category “${category.name}”? Games in progress are unaffected.`)) return
    setBusy(true)
    try {
      await fetch(`/api/admin/landmine-categories/${category.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{category.name}</span>
          <span className="ml-2 text-xs text-[var(--muted)]">{category.entry_count} words</span>
          {category.is_active ? (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-500">
              active
            </span>
          ) : (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
              hidden
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={toggleActive} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
            {category.is_active ? 'Hide' : 'Activate'}
          </button>
          <button type="button" onClick={openEdit} className="btn-secondary px-3 py-1.5 text-xs">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button type="button" onClick={del} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-red-500">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <label className="block text-sm sm:max-w-sm">
            <span className="mb-1 block font-semibold">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-semibold">Words (most obvious first)</span>
            {loadedWords ? (
              <WordsField value={words} onChange={setWords} placeholder="One word per line" />
            ) : (
              <p className="text-sm text-[var(--muted)]">Loading words…</p>
            )}
          </div>
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
