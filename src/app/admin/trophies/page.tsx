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
  is_system?: boolean
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
  // `null` = we don't know, because the load failed. Distinct from 0, which means "nothing to
  // seed" — conflating them is how a broken page claims to be a healthy one.
  const [missingCount, setMissingCount] = useState<number | null>(0)
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
  // System vs custom is the most useful cut in the list: one half is safe to edit, the other
  // is code and only shown here so the catalog reads as the whole truth.
  const [filterSource, setFilterSource] = useState('all')
  const [search, setSearch] = useState('')
  // Raw JSON is the escape hatch, not the default. It turns on by itself when an existing rule
  // is too exotic for the builder — showing a simplified version would let someone save it back
  // and quietly lose what it actually said.
  const [rawMode, setRawMode] = useState(false)
  // The vocabulary reference is a lookup, not a step — collapsed by default so it stays out of
  // the way of the editor. Controlled so the chevron can reflect the state reliably.
  const [vocabOpen, setVocabOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/trophies')
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setTrophies(json.trophies ?? [])
        setVocabulary(json.vocabulary ?? { counters: [], distinct: [] })
        setMissingCount(Number(json.missingCount) || 0)
        setGames(json.games ?? [])
        return
      }
      // A FAILED LOAD MUST NOT READ AS A HEALTHY ONE. This used to be a bare `if (res.ok)` with
      // no else, so an error left every value at its initial state — empty vocabulary, zero
      // missing — and the page rendered that as a complete, up-to-date catalog. The button said
      // "Catalog up to date" when the request had 400'd. `null` means "unknown", which the
      // button below reports honestly.
      setMissingCount(null)
      setMessage(json.error ?? 'Could not load the catalog.')
    } catch {
      setMissingCount(null)
      setMessage('Could not load the catalog.')
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
        (filterSource === 'all' || (filterSource === 'system' ? t.is_system : !t.is_system)) &&
        (!q || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    )
  }, [trophies, filterGame, filterTier, filterSource, search])

  // Only games that actually have trophies — offering all 47 would mostly filter to nothing.
  const gamesWithTrophies = useMemo(() => {
    const present = new Set(trophies.map((t) => t.game_type).filter(Boolean) as string[])
    return games.filter((g) => present.has(g.id))
  }, [trophies, games])

  // The counter vocabulary is 270+ rows once every game is seeded, most of them belonging to one
  // game. There's no game field on a counter, so ownership is read off the key prefix: a
  // game-specific counter starts with `<gameId>_` (with `c8_` the one alias — Crazy Eights emits
  // that prefix). The handful with no game prefix are platform-wide and relevant to every game.
  const [vocabGame, setVocabGame] = useState('all')
  const counterGameOf = useCallback(
    (key: string): string | null => {
      let best: string | null = null
      for (const g of games) {
        if (key.startsWith(g.id + '_') && (!best || g.id.length > best.length)) best = g.id
      }
      if (!best && key.startsWith('c8_') && games.some((g) => g.id === 'crazy_eights')) best = 'crazy_eights'
      return best
    },
    [games]
  )
  // Only games that actually own a counter, so the dropdown doesn't list games with nothing to show.
  const vocabGames = useMemo(() => {
    const owners = new Set(vocabulary.counters.map((c) => counterGameOf(c.key)).filter(Boolean) as string[])
    return games.filter((g) => owners.has(g.id))
  }, [vocabulary.counters, games, counterGameOf])
  // When a game is picked, show its counters PLUS the platform-wide ones (still relevant to a rule
  // for that game); "all" shows everything.
  const shownCounters = useMemo(() => {
    if (vocabGame === 'all') return vocabulary.counters
    return vocabulary.counters.filter((c) => {
      const owner = counterGameOf(c.key)
      return owner === null || owner === vocabGame
    })
  }, [vocabulary.counters, vocabGame, counterGameOf])

  return (
    <div className="space-y-6">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight">Trophies</h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              Trophies are rules over a fixed vocabulary of measurements. You can compose rules freely — what you
              can&apos;t do is invent a new <em>measurement</em>.
            </p>
          </div>
          {/* The seed action, anchored top-right. It's the "a new game was added, give it its
              trophies" action — not a launch step — so it reads as an obvious no-op when nothing
              is missing, and only carries a caption when there's actually something to do. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={seed}
              disabled={busy || missingCount === null || missingCount === 0}
              className={`px-4 py-2 text-sm disabled:opacity-60 ${
                missingCount && missingCount > 0 ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {missingCount === null
                ? 'Catalog unavailable'
                : missingCount > 0
                  ? `Add ${missingCount} missing ${missingCount === 1 ? 'trophy' : 'trophies'}`
                  : '✓ Catalog up to date'}
            </button>
            {missingCount !== 0 && (
              <p className="max-w-[15rem] text-right text-xs text-[var(--muted)]">
                {missingCount === null
                  ? 'Reload the page to try again.'
                  : 'Seeds the standard set for any newly-added game type.'}
              </p>
            )}
          </div>
        </div>

        {/* The two kinds of trophy, as scannable tags rather than a paragraph. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-inset-bg)] px-3 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
            <span className="font-semibold">Custom</span>
            <span className="text-[var(--muted)]">you write and edit these freely</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-inset-bg)] px-3 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
            <span className="font-semibold">System</span>
            <span className="text-[var(--muted)]">defined in code · shown here but retire-only</span>
          </span>
        </div>
      </div>

      {message && <p className="glass-card px-4 py-3 text-sm">{message}</p>}

      {/* The vocabulary is a REFERENCE, not a step — every measure already appears in the rule
          editor's dropdown, labelled. It's kept here because a rule naming a counter that doesn't
          exist reads as zero (the trophy is simply never earned, with no error anywhere), so
          being able to check a name is what separates a typo from a real measure. But it grows
          with every game, so it's collapsed by default and out of the way until wanted. */}
      <details open={vocabOpen} onToggle={(e) => setVocabOpen(e.currentTarget.open)} className="glass-card p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <span className={`inline-block text-[var(--muted)] transition-transform ${vocabOpen ? 'rotate-90' : ''}`}>
              ›
            </span>
            What rules can measure
          </span>
          <span className="text-xs font-normal normal-case text-[var(--muted)]">
            {vocabulary.counters.length} counter{vocabulary.counters.length === 1 ? '' : 's'} ·{' '}
            {vocabulary.distinct.length} distinct set{vocabulary.distinct.length === 1 ? '' : 's'}
          </span>
        </summary>
        <p className="mt-2 text-xs text-[var(--muted)]">
          The measurements rules are built from. You can compose these freely, but you can&apos;t invent a new one — a
          rule naming anything not listed here is never earned.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-faint text-xs uppercase tracking-wide">Counters</p>
              {/* Most counters belong to one game, so narrow to a game to keep this short. The
                  platform-wide counters stay visible under any game, since a rule for that game
                  can still use them. */}
              <select
                className="input-field !mt-0 !w-auto !py-1 text-xs"
                value={vocabGame}
                onChange={(e) => setVocabGame(e.target.value)}
                aria-label="Filter counters by game"
              >
                <option value="all">All games ({vocabulary.counters.length})</option>
                {vocabGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <ul className="space-y-1.5 text-sm">
              {shownCounters.map((c) => (
                <li key={c.key}>
                  <code className="rounded bg-[var(--surface-inset-bg)] px-1.5 py-0.5 text-xs">{c.key}</code>{' '}
                  <span className="text-[var(--muted)]">{c.description}</span>
                  {c.availability === 'partial' && (
                    <span className="ml-1 text-xs text-amber-600">· not every game can be scored</span>
                  )}
                </li>
              ))}
            </ul>
            {vocabGame !== 'all' && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Showing {vocabGames.find((g) => g.id === vocabGame)?.label ?? vocabGame} counters plus the platform-wide
                ones.{' '}
                <button
                  type="button"
                  onClick={() => setVocabGame('all')}
                  className="font-semibold text-[var(--primary)]"
                >
                  Show all
                </button>
              </p>
            )}
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
      </details>

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

        <div className="mb-4 grid gap-2 sm:grid-cols-4">
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
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="all">System &amp; custom</option>
            <option value="system">System only</option>
            <option value="custom">Custom only</option>
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
                    {/* System trophies are code — shown so the catalog is the whole truth, but
                        their rule only works alongside the facts builder that emits its counter,
                        so there is no Edit button for them. */}
                    {t.is_system && (
                      <span className="rounded-full bg-[var(--surface-inset-bg)] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        System
                      </span>
                    )}{' '}
                    {!t.is_active && <span className="text-xs font-normal text-[var(--muted)]">· retired</span>}
                    {t.hidden && <span className="text-xs font-normal text-[var(--muted)]">· hidden</span>}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    <code>{t.id}</code> · {t.game_type ? `${t.game_type} · ` : ''}
                    {t.points} pts · {t.description}
                  </p>
                </div>
                {t.is_system ? (
                  <span className="text-xs text-[var(--muted)]">Defined in code</span>
                ) : (
                  <button type="button" onClick={() => edit(t)} className="btn-secondary btn-fit px-3 py-1.5 text-xs">
                    Edit
                  </button>
                )}
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
