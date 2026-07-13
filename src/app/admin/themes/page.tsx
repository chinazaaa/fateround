'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type GameTypeId = 'crossword' | 'word_search' | 'word_scramble'

const GAME_TYPES: { id: GameTypeId; label: string; columns: string; sample: string }[] = [
  { id: 'crossword', label: 'Crossword', columns: 'answer,clue', sample: '/crossword-answers-sample.csv' },
  { id: 'word_search', label: 'Word Search', columns: 'word', sample: '/word-search-words-sample.csv' },
  {
    id: 'word_scramble',
    label: 'Word Scramble',
    columns: 'word,hint (hint optional)',
    sample: '/word-scramble-words-sample.csv',
  },
]

const DIFFICULTIES = [
  { value: '', label: 'Host chooses (unlocked)' },
  { value: 'easy', label: 'Easy (locked)' },
  { value: 'medium', label: 'Medium (locked)' },
  { value: 'hard', label: 'Hard (locked)' },
]

type Theme = {
  id: string
  game_type: GameTypeId
  name: string
  difficulty: string | null
  entry_count: number
  is_builtin: boolean
  created_at: string
  updated_at: string
}

type ImportStats = { totalRows: number; skippedRows: number; duplicateRows: number } | null

function gameTypeMeta(id: GameTypeId) {
  return GAME_TYPES.find((g) => g.id === id)!
}

function statsLine(count: number, stats: ImportStats): string {
  if (!stats) return `${count} words`
  const bits = [`${count} words`]
  if (stats.duplicateRows) bits.push(`${stats.duplicateRows} duplicates skipped`)
  if (stats.skippedRows) bits.push(`${stats.skippedRows} invalid rows skipped`)
  return bits.join(' · ')
}

export default function AdminThemesPage() {
  const [gameType, setGameType] = useState<GameTypeId>('crossword')
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/puzzle-themes?game_type=${gameType}`)
      const json = await res.json()
      setThemes(res.ok ? (json.themes ?? []) : [])
    } finally {
      setLoading(false)
    }
  }, [gameType])

  useEffect(() => {
    void load()
  }, [load])

  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const importBuiltins = async () => {
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/admin/puzzle-themes/import-builtins', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setImportMsg(json.error ?? 'Import failed')
        return
      }
      setImportMsg(
        json.inserted > 0 ? `Imported ${json.inserted} built-in theme(s).` : 'Built-in themes are already imported.'
      )
      load()
    } catch {
      setImportMsg('Network error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Puzzle themes</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Named word packs hosts can pick for Crossword, Word Search and Word Scramble. Lock a difficulty to make e.g.
            &ldquo;Geography Hard&rdquo; its own theme; leave it unlocked to let the host choose.
          </p>
        </div>
        <div className="text-right">
          <button
            type="button"
            onClick={importBuiltins}
            disabled={importing}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import built-in themes'}
          </button>
          {importMsg && <p className="mt-1 text-xs text-[var(--muted)]">{importMsg}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {GAME_TYPES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGameType(g.id)}
            className={
              gameType === g.id
                ? 'rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-white'
                : 'rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]'
            }
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* key remounts the form when the game type changes, resetting all fields (and the file
          input) so a crossword CSV can't be left over when switching to word search etc. */}
      <CreateThemeForm key={gameType} gameType={gameType} onCreated={load} />

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
          {gameTypeMeta(gameType).label} themes
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : themes.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No themes yet — create one above.</p>
        ) : (
          themes.map((t) => <ThemeRow key={t.id} theme={t} onChanged={load} />)
        )}
      </div>
    </div>
  )
}

function CreateThemeForm({ gameType, onCreated }: { gameType: GameTypeId; onCreated: () => void }) {
  const meta = gameTypeMeta(gameType)
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setCsv(await file.text())
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const res = await fetch('/api/admin/puzzle-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: gameType, name, difficulty, csv }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not create theme')
        return
      }
      setOkMsg(`Created “${json.theme.name}” — ${statsLine(json.theme.entry_count, json.stats ?? null)}`)
      setName('')
      setDifficulty('')
      setCsv('')
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
      onCreated()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = name.trim().length > 0 && csv.trim().length > 0 && !busy

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">New {meta.label} theme</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Theme name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Geography"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 text-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">
            Words (CSV — columns: <code className="text-[var(--primary)]">{meta.columns}</code>)
          </span>
          <a href={meta.sample} download className="text-[var(--primary)] hover:underline">
            Download sample CSV
          </a>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary px-3 py-1.5 text-sm">
            ⬆ Upload CSV
          </button>
          {fileName ? (
            <span className="text-xs text-[var(--muted)]">{fileName}</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">or paste rows below</span>
          )}
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={`Upload a .csv above or paste rows here.\nHeader row: ${meta.columns}`}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
        />
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
          {busy ? 'Creating…' : 'Create theme'}
        </button>
      </div>
    </div>
  )
}

function ThemeRow({ theme, onChanged }: { theme: Theme; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(theme.name)
  const [difficulty, setDifficulty] = useState(theme.difficulty ?? '')
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name, difficulty }
      if (csv.trim()) body.csv = csv
      const res = await fetch(`/api/admin/puzzle-themes/${theme.id}`, {
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
      setCsv('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    if (!confirm(`Delete theme “${theme.name}”? Games already using it are unaffected.`)) return
    setBusy(true)
    try {
      await fetch(`/api/admin/puzzle-themes/${theme.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{theme.name}</span>
          {theme.is_builtin && (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
              built-in
            </span>
          )}
          <span className="ml-2 text-xs text-[var(--muted)]">{theme.entry_count} words</span>
          {theme.difficulty ? (
            <span className="ml-2 rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-xs font-semibold capitalize text-[var(--primary)]">
              {theme.difficulty} · locked
            </span>
          ) : (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
              host chooses difficulty
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-secondary px-3 py-1.5 text-xs">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button type="button" onClick={del} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-red-500">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Replace words (optional — leave blank to keep current)</span>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={5}
              placeholder="Paste a new CSV to replace the word list"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
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
