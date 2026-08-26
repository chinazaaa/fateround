'use client'

import { useCallback, useEffect, useState } from 'react'

type User = {
  id: string
  handle: string | null
  isAnonymous: boolean
  trophyPoints: number
  trophyLevel: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  createdAt: string
  gamesPlayed: number
  gamesWon: number
  gameTypes: number
  trophies: number
  country: string | null
  coins: number
}

type Detail = {
  user: User & { email: string | null; emailConfirmedAt: string | null; preferredTheme: string | null }
  totals: { gamesPlayed: number; gamesWon: number; gameTypes: number; counters: Record<string, number> }
  perGame: {
    gameType: string
    label: string
    gamesPlayed: number
    gamesWon: number
    counters: Record<string, number>
  }[]
  trophies: {
    id: string
    title: string
    tier: string | null
    points: number
    gameType: string | null
    gameLabel: string | null
    isActive: boolean
    known: boolean
    earnedAt: string
  }[]
}

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

const COHORTS = [
  { value: 'all', label: 'Everyone' },
  { value: 'account', label: 'With email' },
  { value: 'guest', label: 'Guests' },
  { value: 'active', label: 'Active (30d)' },
] as const

function shortDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Admin: the people who have a profile.
 *
 * A profile is created at a player's FIRST GAME FINISH, so this is not "everyone who has ever
 * played" — most people never create an identity. That caveat is on the page itself, because a
 * number this shape is very easy to read as total reach.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [totals, setTotals] = useState<{
    profiles: number
    withAccount: number
    guests: number
    activeRecently: number
  } | null>(null)
  const [matching, setMatching] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [cohort, setCohort] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ page: String(page), cohort })
      if (search.trim()) qs.set('q', search.trim())
      const res = await fetch(`/api/admin/users?${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not load users.')
        return
      }
      setUsers(json.users ?? [])
      setTotals(json.totals ?? null)
      setMatching(json.matching ?? 0)
      setPageSize(json.pageSize ?? 50)
    } finally {
      setLoading(false)
    }
  }, [page, cohort, search])

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(), 250)
    return () => clearTimeout(t)
  }, [load])

  const openDetail = async (id: string) => {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok) setDetail(json)
    } finally {
      setDetailLoading(false)
    }
  }

  const lastPage = Math.max(0, Math.ceil(matching / pageSize) - 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Users</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          A profile is created the first time someone <strong>finishes</strong> a game — not when they join. Most
          players never create one, so this is not total reach; use Statistics for that.
        </p>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Profiles" value={totals.profiles} />
          <Stat label="With email" value={totals.withAccount} />
          <Stat label="Guests" value={totals.guests} />
          <Stat label="Active (30d)" value={totals.activeRecently} />
        </div>
      )}

      <div className="glass-card p-5">
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            className="input-field !py-2 text-sm"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setPage(0)
              setSearch(e.target.value)
            }}
          />
          <select
            className="input-field !py-2 text-sm"
            value={cohort}
            onChange={(e) => {
              setPage(0)
              setCohort(e.target.value)
            }}
            aria-label="Filter by cohort"
          >
            {COHORTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mb-3 text-sm text-[var(--marry)]">{error}</p>}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nobody matches that.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3 text-right">Played</th>
                    <th className="py-2 pr-3 text-right">Won</th>
                    <th className="py-2 pr-3 text-right">Games</th>
                    <th className="py-2 pr-3 text-right">🏆</th>
                    <th className="py-2 pr-3 text-right">Pts</th>
                    <th className="py-2 pr-3 text-right">Streak</th>
                    <th className="py-2 pr-3 text-right">🪙</th>
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3">Last active</th>
                    <th className="py-2">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => void openDetail(u.id)}
                      className="cursor-pointer hover:bg-[var(--surface-inset-bg)]"
                    >
                      <td className="py-2 pr-3 font-semibold">
                        {u.handle ?? <span className="text-[var(--muted)]">No name</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={u.isAnonymous ? 'text-[var(--muted)]' : 'font-semibold'}>
                          {u.isAnonymous ? 'Guest' : 'Email'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">{u.gamesPlayed}</td>
                      <td className="py-2 pr-3 text-right">{u.gamesWon}</td>
                      <td className="py-2 pr-3 text-right">{u.gameTypes}</td>
                      <td className="py-2 pr-3 text-right">{u.trophies}</td>
                      <td className="py-2 pr-3 text-right">{u.trophyPoints}</td>
                      <td className="py-2 pr-3 text-right">
                        {u.currentStreak}
                        {u.longestStreak > u.currentStreak && (
                          <span className="text-[var(--muted)]"> / {u.longestStreak}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{u.coins.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{u.country ? countryName(u.country) : '—'}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{shortDate(u.lastActiveDate)}</td>
                      <td className="py-2 text-[var(--muted)]">{shortDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">
                {matching} {matching === 1 ? 'person' : 'people'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-sm"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {openId && (
        <UserDetail
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setOpenId(null)
            setDetail(null)
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-4">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  )
}

function UserDetail({ detail, loading, onClose }: { detail: Detail | null; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      {/* Solid, not `glass-card`: this panel sits over a dense table and a translucent one let
          the rows behind it read straight through the trophy list. */}
      <div className="mt-8 w-full max-w-2xl space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{detail?.user.handle ?? 'User'}</h2>
            {detail && (
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                {detail.user.isAnonymous ? 'Guest (no email)' : (detail.user.email ?? 'Account, email not readable')}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ✕
          </button>
        </div>

        {loading || !detail ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Played" value={detail.totals.gamesPlayed} />
              <Stat label="Won" value={detail.totals.gamesWon} />
              <Stat label="Trophies" value={detail.trophies.length} />
              <Stat label="Points" value={detail.user.trophyPoints} />
            </div>

            <p className="text-sm text-[var(--muted)]">
              Level {detail.user.trophyLevel} · streak {detail.user.currentStreak} (best {detail.user.longestStreak}) ·
              last active {shortDate(detail.user.lastActiveDate)} · joined {shortDate(detail.user.createdAt)}
            </p>

            <section>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Games</h3>
              {detail.perGame.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No finished games recorded.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {detail.perGame.map((g) => (
                    <li key={g.gameType} className="flex justify-between py-1.5">
                      <span>{g.label}</span>
                      <span className="text-[var(--muted)]">
                        {g.gamesPlayed} played · {g.gamesWon} won
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Trophies ({detail.trophies.length})</h3>
              {detail.trophies.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">None yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {detail.trophies.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3 py-1.5">
                      <span>
                        <span aria-hidden>{(t.tier && TIER_EMOJI[t.tier]) ?? '🏅'}</span> {t.title}{' '}
                        {/* The game is part of the identity, not decoration: titles come from
                            shared templates, so "First round" exists once per game AND
                            cross-game. Two rows reading the same is what makes it look like
                            the same trophy was awarded twice. */}
                        <span className="text-[var(--muted)]">
                          · {t.gameLabel ?? (t.known ? 'No game' : 'Deleted from catalog')}
                        </span>
                        {t.known && !t.isActive && (
                          <span className="ml-1 rounded-full bg-[var(--surface-inset-bg)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Retired
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[var(--muted)]">{shortDate(t.earnedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {Object.keys(detail.totals.counters).length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide">Cross-game counters</h3>
                <p className="mb-2 text-xs text-[var(--muted)]">
                  The raw measurements trophy rules are written against, totalled across every game (per-game counts are
                  in Games above). <code>days_played</code> is distinct days with a finished game — the number streak
                  trophies read. Check here when someone asks why a trophy hasn&apos;t unlocked.
                </p>
                <ul className="text-sm text-[var(--muted)]">
                  {Object.entries(detail.totals.counters).map(([key, value]) => (
                    <li key={key} className="flex justify-between py-0.5">
                      <code>{key}</code>
                      <span>{value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
