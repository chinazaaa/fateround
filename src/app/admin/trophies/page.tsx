'use client'

import { useCallback, useEffect, useState } from 'react'

type Trophy = {
  id: string
  game_type: string | null
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  title: string
  description: string
  criteria: unknown
  points: number
  hidden: boolean
  sort_order: number
  is_active: boolean
}

type CounterDef = { key: string; label: string; description: string; scope: string; availability: string }
type DistinctDef = { key: string; label: string; description: string; availability: string }
type Vocabulary = { counters: CounterDef[]; distinct: DistinctDef[] }
type GameOption = { id: string; label: string; canScoreWins: boolean; winnerless: boolean }

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const

const EMPTY = {
  id: '',
  game_type: '',
  tier: 'bronze' as Trophy['tier'],
  title: '',
  description: '',
  points: 25,
  hidden: false,
  sort_order: 0,
  criteriaText: '{\n  "type": "counter",\n  "counter": "games_won",\n  "gte": 1\n}',
}

const TIER_STYLE: Record<Trophy['tier'], string> = {
  bronze: 'bg-amber-700/15 text-amber-700',
  silver: 'bg-slate-400/15 text-slate-500',
  gold: 'bg-yellow-500/15 text-yellow-600',
  platinum: 'bg-cyan-500/15 text-cyan-600',
}

export default function AdminTrophiesPage() {
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [vocabulary, setVocabulary] = useState<Vocabulary>({ counters: [], distinct: [] })
  const [games, setGames] = useState<GameOption[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/trophies')
      const json = await res.json()
      if (res.ok) {
        setTrophies(json.trophies ?? [])
        setVocabulary(json.vocabulary ?? { counters: [], distinct: [] })
        setGames(json.games ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const seed = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/trophies', { method: 'PUT' })
      const json = await res.json()
      setMessage(res.ok ? `Seeded ${json.seeded}, left ${json.skipped} untouched.` : (json.error ?? 'Seeding failed'))
      if (res.ok) await load()
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      let criteria: unknown
      try {
        criteria = JSON.parse(form.criteriaText)
      } catch {
        setMessage('The rule is not valid JSON.')
        return
      }

      const payload = {
        game_type: form.game_type || null,
        tier: form.tier,
        title: form.title,
        description: form.description,
        points: form.points,
        hidden: form.hidden,
        sort_order: form.sort_order,
        criteria,
      }

      const res = editing
        ? await fetch(`/api/admin/trophies/${encodeURIComponent(editing)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/trophies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, id: form.id }),
          })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error ?? 'Could not save.')
        return
      }
      setMessage(editing ? 'Saved.' : 'Trophy created.')
      setForm(EMPTY)
      setEditing(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const retire = async (trophy: Trophy) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/trophies/${encodeURIComponent(trophy.id)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      setMessage(
        json.retired
          ? `Retired — ${json.earnedBy} player(s) keep it.`
          : json.deleted
            ? 'Deleted (nobody had earned it).'
            : (json.error ?? 'Could not retire.')
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  const edit = (trophy: Trophy) => {
    setEditing(trophy.id)
    setForm({
      id: trophy.id,
      game_type: trophy.game_type ?? '',
      tier: trophy.tier,
      title: trophy.title,
      description: trophy.description,
      points: trophy.points,
      hidden: trophy.hidden,
      sort_order: trophy.sort_order,
      criteriaText: JSON.stringify(trophy.criteria, null, 2),
    })
    setMessage(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Trophies</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            A trophy is a rule over the counters the server measures, so new ones are added here rather than in code.
            What you can&apos;t invent is a new <em>measurement</em> — the vocabulary below is what rules can talk
            about.
          </p>
        </div>
        <button
          type="button"
          onClick={seed}
          disabled={busy}
          className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
        >
          Seed launch trophies
        </button>
      </div>

      {message && <p className="glass-card px-4 py-3 text-sm">{message}</p>}

      {/* The vocabulary is shown next to the editor on purpose. A rule referencing a counter
          that doesn't exist reads as zero — the trophy is simply never earned, with no error
          anywhere — so guessing a name is indistinguishable from a typo. */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">What rules can measure</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-faint mb-2 text-xs uppercase tracking-wide">Counters</p>
            <ul className="space-y-1.5 text-sm">
              {vocabulary.counters.map((c) => (
                <li key={c.key}>
                  <code className="rounded bg-[var(--surface-inset-bg)] px-1.5 py-0.5 text-xs">{c.key}</code>{' '}
                  <span className="text-[var(--muted)]">{c.description}</span>
                  {c.availability === 'partial' && (
                    <span className="ml-1 text-xs text-amber-600">· not every game can be scored</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-faint mb-2 text-xs uppercase tracking-wide">Distinct sets</p>
            <ul className="space-y-1.5 text-sm">
              {vocabulary.distinct.map((d) => (
                <li key={d.key}>
                  <code className="rounded bg-[var(--surface-inset-bg)] px-1.5 py-0.5 text-xs">{d.key}</code>{' '}
                  <span className="text-[var(--muted)]">{d.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">{editing ? `Edit ${editing}` : 'New trophy'}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Id</span>
            <input
              className="input-field mt-1"
              value={form.id}
              disabled={!!editing}
              placeholder="first_win"
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Title</span>
            <input
              className="input-field mt-1"
              value={form.title}
              maxLength={80}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Description</span>
          <input
            className="input-field mt-1"
            value={form.description}
            maxLength={300}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">This trophy is for</span>
          <select
            className="input-field mt-1"
            value={form.game_type}
            onChange={(e) => setForm({ ...form, game_type: e.target.value })}
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          {form.game_type && (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Counters in the rule will be scoped to this game automatically, so it counts only{' '}
              {games.find((g) => g.id === form.game_type)?.label ?? form.game_type} games.
            </span>
          )}
          {/* A win rule on a game the server can't score parses, saves and never fires. Saying so
              here is the only place the difference between that and a typo is visible. */}
          {form.game_type &&
            /"counter"\s*:\s*"(games_won|podium_finishes)"/.test(form.criteriaText) &&
            !games.find((g) => g.id === form.game_type)?.canScoreWins && (
              <span className="mt-1 block text-xs text-amber-600">
                {games.find((g) => g.id === form.game_type)?.winnerless
                  ? 'This game has no winner — everyone answers and nothing is scored, so a win rule can never be earned.'
                  : 'Wins are not scored for this game yet, so this rule would never be earned.'}
              </span>
            )}
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Tier</span>
            <select
              className="input-field mt-1"
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value as Trophy['tier'] })}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Points</span>
            <input
              type="number"
              className="input-field mt-1"
              value={form.points}
              min={0}
              max={1000}
              onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Sort order</span>
            <input
              type="number"
              className="input-field mt-1"
              value={form.sort_order}
              min={0}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Rule</span>
          <textarea
            className="input-field mt-1 font-mono text-xs"
            rows={7}
            value={form.criteriaText}
            onChange={(e) => setForm({ ...form, criteriaText: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.hidden}
            onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
          />
          <span className="text-[var(--muted)]">Hidden until earned</span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={busy} className="btn-primary btn-fit px-4 py-2 text-sm">
            {editing ? 'Save changes' : 'Create trophy'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setForm(EMPTY)
              }}
              className="btn-secondary btn-fit px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Catalog ({trophies.length})</h2>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : trophies.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing yet — use <strong>Seed launch trophies</strong> to add the starting set.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {trophies.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TIER_STYLE[t.tier]}`}>{t.tier}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {t.title}{' '}
                    {!t.is_active && <span className="text-xs font-normal text-[var(--muted)]">· retired</span>}
                    {t.hidden && <span className="text-xs font-normal text-[var(--muted)]">· hidden</span>}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    <code>{t.id}</code> · {t.game_type ? `${t.game_type} · ` : ''}
                    {t.points} pts · {t.description}
                  </p>
                </div>
                <button type="button" onClick={() => edit(t)} className="btn-secondary btn-fit px-3 py-1.5 text-xs">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => retire(t)}
                  disabled={busy}
                  className="btn-secondary btn-fit px-3 py-1.5 text-xs !text-red-500"
                >
                  Retire
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
