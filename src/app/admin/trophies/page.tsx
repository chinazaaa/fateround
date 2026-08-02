'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeRule, fromCriteria, toCriteria, type Condition, type SimpleRule } from '@/lib/trophies/rule-builder'

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

const DEFAULT_RULE: SimpleRule = {
  combinator: 'all',
  conditions: [{ measure: 'games_won', kind: 'counter', gte: 1 }],
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
  // How many trophies seeding would add. Drives the button's label so it reads as a real
  // action ("Add 12 missing trophies") or an obvious no-op ("Catalog up to date").
  const [missingCount, setMissingCount] = useState(0)
  const [games, setGames] = useState<GameOption[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rule, setRule] = useState<SimpleRule>(DEFAULT_RULE)
  // 280+ rows once every game is seeded, so the catalog is unusable without narrowing.
  const [filterGame, setFilterGame] = useState('all')
  const [filterTier, setFilterTier] = useState('all')
  const [search, setSearch] = useState('')
  // Raw JSON is the escape hatch, not the default. It turns on by itself when an existing rule
  // is too exotic for the builder — showing a simplified version would let someone save it back
  // and quietly lose what it actually said.
  const [rawMode, setRawMode] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/trophies')
      const json = await res.json()
      if (res.ok) {
        setTrophies(json.trophies ?? [])
        setVocabulary(json.vocabulary ?? { counters: [], distinct: [] })
        setMissingCount(Number(json.missingCount) || 0)
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
      // A failure before a JSON body would otherwise throw past the caller as an unhandled
      // rejection, leaving the admin with no message at all.
      const json = await res.json().catch(() => ({}))
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
      if (rawMode) {
        try {
          criteria = JSON.parse(form.criteriaText)
        } catch {
          setMessage('The rule is not valid JSON.')
          return
        }
      } else {
        if (!rule.conditions.length) {
          setMessage('Add at least one condition.')
          return
        }
        criteria = toCriteria(rule)
      }

      // A trophy with no game has nowhere to appear: the profile lists the games you've PLAYED
      // and opens each one's trophies, so a game-less trophy could be awarded and then never be
      // seen by the player who earned it. Requiring a game is what keeps the catalog and the
      // player-facing list the same set.
      if (!form.game_type) {
        setMessage('Choose which game this trophy is for.')
        return
      }

      const payload = {
        game_type: form.game_type,
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
      setRule(DEFAULT_RULE)
      setRawMode(false)
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
    const parsed = fromCriteria(trophy.criteria)
    setRule(parsed ?? DEFAULT_RULE)
    setRawMode(!parsed)
    setMessage(null)
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trophies.filter(
      (t) =>
        (filterGame === 'all' || t.game_type === filterGame) &&
        (filterTier === 'all' || t.tier === filterTier) &&
        (!q || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    )
  }, [trophies, filterGame, filterTier, search])

  // Only games that actually have trophies — offering all 47 would mostly filter to nothing.
  const gamesWithTrophies = useMemo(() => {
    const present = new Set(trophies.map((t) => t.game_type).filter(Boolean) as string[])
    return games.filter((g) => present.has(g.id))
  }, [trophies, games])

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
        {/* Kept, but stated as what it does. It is the "a new game was added, give it its
            trophies" action — not a launch step — so when nothing is missing it says so rather
            than sitting there looking like something you forgot to press. */}
        <div className="text-right">
          <button
            type="button"
            onClick={seed}
            disabled={busy || missingCount === 0}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
          >
            {missingCount > 0
              ? `Add ${missingCount} missing ${missingCount === 1 ? 'trophy' : 'trophies'}`
              : 'Catalog up to date'}
          </button>
          <p className="mt-1 max-w-[16rem] text-xs text-[var(--muted)]">
            Builds the standard set for any game that has none — press it after adding a new game type.
          </p>
        </div>
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
            <option value="">Choose a game…</option>
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
            (rawMode
              ? /"counter"\s*:\s*"(games_won|podium_finishes)"/.test(form.criteriaText)
              : rule.conditions.some((c) => c.measure === 'games_won' || c.measure === 'podium_finishes')) &&
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
              // Number('') is 0 and a partial entry is NaN, which serializes to null and gets
              // rejected server-side with a message that explains nothing.
              onChange={(e) => setForm({ ...form, points: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Sort order</span>
            <input
              type="number"
              className="input-field mt-1"
              value={form.sort_order}
              min={0}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">When is it earned?</span>
            <button
              type="button"
              onClick={() => setRawMode((v) => !v)}
              className="text-xs font-semibold text-[var(--primary)]"
            >
              {rawMode ? 'Use the simple editor' : 'Edit as JSON'}
            </button>
          </div>

          {rawMode ? (
            <>
              <textarea
                className="input-field font-mono text-xs"
                rows={7}
                value={form.criteriaText}
                onChange={(e) => setForm({ ...form, criteriaText: e.target.value })}
              />
              <p className="text-xs text-[var(--muted)]">Only needed for rules the simple editor can&apos;t express.</p>
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
              {rule.conditions.length > 1 && (
                <label className="block text-xs text-[var(--muted)]">
                  Player must meet{' '}
                  <select
                    className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    value={rule.combinator}
                    onChange={(e) => setRule({ ...rule, combinator: e.target.value as 'all' | 'any' })}
                  >
                    <option value="all">all</option>
                    <option value="any">any</option>
                  </select>{' '}
                  of these:
                </label>
              )}

              {rule.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    className="input-field !mt-0 min-w-0 flex-1"
                    value={`${condition.kind}:${condition.measure}`}
                    onChange={(e) => {
                      const [kind, measure] = e.target.value.split(':')
                      const next = [...rule.conditions]
                      next[index] = { ...condition, kind: kind as Condition['kind'], measure }
                      setRule({ ...rule, conditions: next })
                    }}
                  >
                    <optgroup label="Counters">
                      {vocabulary.counters.map((c) => (
                        <option key={c.key} value={`counter:${c.key}`}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Distinct sets">
                      {vocabulary.distinct.map((d) => (
                        <option key={d.key} value={`distinct:${d.key}`}>
                          {d.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <span className="text-sm text-[var(--muted)]">of at least</span>
                  <input
                    type="number"
                    min={1}
                    className="input-field !mt-0 !w-20 shrink-0"
                    value={condition.gte}
                    onChange={(e) => {
                      const next = [...rule.conditions]
                      next[index] = { ...condition, gte: Number(e.target.value) }
                      setRule({ ...rule, conditions: next })
                    }}
                  />
                  {rule.conditions.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove condition"
                      onClick={() => setRule({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) })}
                      className="text-sm text-[var(--muted)] hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setRule({
                    ...rule,
                    conditions: [...rule.conditions, { measure: 'games_played', kind: 'counter', gte: 1 }],
                  })
                }
                className="text-xs font-semibold text-[var(--primary)]"
              >
                + Add condition
              </button>

              {/* The sentence is the point: someone can check what they wrote without knowing
                  the rule format. "Win at least 25 games" is verifiable at a glance. */}
              <p className="border-t border-[var(--border)] pt-2 text-sm">
                {describeRule(rule, games.find((g) => g.id === form.game_type)?.label ?? null)}
              </p>
            </div>
          )}
        </div>

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
                setRule(DEFAULT_RULE)
                setRawMode(false)
              }}
              className="btn-secondary btn-fit px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">
          Catalog ({visible.length}
          {visible.length !== trophies.length && ` of ${trophies.length}`})
        </h2>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <input
            className="input-field !py-2 text-sm"
            placeholder="Search title or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-field !py-2 text-sm"
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            aria-label="Filter by game"
          >
            <option value="all">Every game</option>
            {gamesWithTrophies.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            className="input-field !py-2 text-sm"
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            aria-label="Filter by tier"
          >
            <option value="all">Any tier</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : trophies.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing yet — use the button above to build the standard set for every game.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing matches those filters.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((t) => (
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
