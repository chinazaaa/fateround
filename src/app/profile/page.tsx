'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authHeaders } from '@/lib/identity'

type Trophy = {
  id: string
  gameType: string | null
  gameLabel: string | null
  tier: string
  title: string
  description: string
  points: number
  earned: boolean
  earnedAt: string | null
  progress: number
  rarityPct: number | null
}

type Group = { gameType: string | null; label: string; earned: number; total: number; trophies: Trophy[] }
type Totals = { earned: number; total: number; pct: number; points: number; level: number }
type ProfileSummary = {
  handle: string | null
  trophy_points: number
  trophy_level: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
} | null

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const
const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

/** "1 day", not "1 days". The mismatch is small and it is the thing people notice. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export default function ProfilePage() {
  const params = useSearchParams()
  const [profile, setProfile] = useState<ProfileSummary>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)

  const [tier, setTier] = useState<string>('all')
  const [status, setStatus] = useState<'all' | 'earned' | 'locked'>('all')
  // Deep-linked from inside a game ("see this game's trophies"), so the page opens already
  // filtered rather than making someone find the game in a long list.
  const [game, setGame] = useState<string>(params.get('game') ?? 'all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (!headers) {
        setSignedOut(true)
        return
      }
      const res = await fetch('/api/profile/trophies', { headers })
      if (!res.ok) return
      const json = await res.json()
      if (!json.profile) {
        setSignedOut(true)
        return
      }
      setProfile(json.profile)
      setGroups(json.groups ?? [])
      setTotals(json.totals ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return groups
      .filter((g) => game === 'all' || (g.gameType ?? 'all') === game)
      .map((g) => ({
        ...g,
        trophies: g.trophies.filter(
          (t) =>
            (tier === 'all' || t.tier === tier) && (status === 'all' || (status === 'earned' ? t.earned : !t.earned))
        ),
      }))
      .filter((g) => g.trophies.length > 0)
  }, [groups, tier, status, game])

  const visibleCount = filtered.reduce((sum, g) => sum + g.trophies.length, 0)
  const filtering = tier !== 'all' || status !== 'all' || game !== 'all'

  if (loading) return <p className="mx-auto max-w-3xl p-6 text-sm text-muted">Loading…</p>

  // No identity yet is the normal state for someone who has never finished a game — not an
  // error, and not a reason to show an empty case that implies they lost something.
  if (signedOut) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-black tracking-tight">Your profile</h1>
        <p className="text-body">
          Finish a game and your trophies and streak start here. Save them to an email and they follow you to any
          device.
        </p>
        <Link href="/" className="btn-primary btn-fit inline-block px-5 py-2.5 text-sm">
          Find a game
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{profile?.handle || 'Your profile'}</h1>
        <p className="mt-0.5 text-sm text-muted">
          Level {totals?.level ?? 1} · {plural(totals?.points ?? 0, 'point')}
        </p>
      </div>

      {/* Three across at every width. Stacked, these were three tall cards holding one number
          each and pushed the trophies — the actual content — below the fold. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">🔥{profile?.current_streak ?? 0}</p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Day streak</p>
          <p className="text-faint text-[11px]">Best {profile?.longest_streak ?? 0}</p>
        </div>
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">
            {totals?.earned ?? 0}
            <span className="text-faint text-base font-semibold">/{totals?.total ?? 0}</span>
          </p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Trophies</p>
          <p className="text-faint text-[11px]">{totals?.pct ?? 0}% done</p>
        </div>
        <div className="glass-card p-3 text-center sm:p-4">
          <p className="text-2xl font-black sm:text-3xl">{totals?.points ?? 0}</p>
          <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">Points</p>
          <p className="text-faint text-[11px]">Level {totals?.level ?? 1}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'earned', 'locked'] as const).map((value) => (
            <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
              {value === 'all' ? 'All' : value === 'earned' ? 'Earned' : 'Locked'}
            </FilterChip>
          ))}
          <span className="mx-1 self-center text-[var(--border-strong)]">|</span>
          {(['all', ...TIERS] as const).map((value) => (
            <FilterChip key={value} active={tier === value} onClick={() => setTier(value)}>
              {value === 'all' ? 'Any tier' : `${TIER_EMOJI[value]} ${value}`}
            </FilterChip>
          ))}
        </div>

        {groups.length > 1 && (
          <select
            className="input-field !py-2 text-sm"
            value={game}
            onChange={(e) => setGame(e.target.value)}
            aria-label="Filter by game"
          >
            <option value="all">Every game</option>
            {groups.map((g) => (
              <option key={g.label} value={g.gameType ?? 'all'}>
                {g.label} ({g.earned}/{g.total})
              </option>
            ))}
          </select>
        )}
      </div>

      {visibleCount === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">
          {filtering ? 'Nothing matches those filters.' : 'No trophies have been set up yet.'}
        </p>
      ) : (
        filtered.map((group) => (
          <section key={group.label} className="glass-card p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-bold">{group.label}</h2>
              <span className="text-faint text-xs">
                {group.earned}/{group.total}
                {group.total > 0 && ` · ${Math.round((group.earned / group.total) * 100)}%`}
              </span>
            </div>

            <ul className="space-y-2">
              {group.trophies.map((trophy) => (
                <li
                  key={trophy.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${
                    trophy.earned
                      ? 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <span className={`text-xl ${trophy.earned ? '' : 'opacity-40 grayscale'}`} aria-hidden>
                    {TIER_EMOJI[trophy.tier] ?? '🏅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${trophy.earned ? '' : 'text-muted'}`}>{trophy.title}</p>
                    <p className="text-sm text-muted">{trophy.description}</p>

                    {/* A bar only where there is something to travel. A full bar on an earned
                        trophy is noise; the date is the more interesting fact. */}
                    {!trophy.earned && trophy.progress > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset-bg)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)]"
                          style={{ width: `${Math.round(trophy.progress * 100)}%` }}
                        />
                      </div>
                    )}

                    <p className="text-faint mt-1 text-xs">
                      {plural(trophy.points, 'pt')}
                      {trophy.earned && trophy.earnedAt
                        ? ` · earned ${new Date(trophy.earnedAt).toLocaleDateString()}`
                        : trophy.progress > 0
                          ? ` · ${Math.round(trophy.progress * 100)}% there`
                          : ''}
                      {trophy.rarityPct !== null && ` · ${trophy.rarityPct}% of players`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white'
          : 'rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-muted hover:text-[var(--foreground)]'
      }
    >
      {children}
    </button>
  )
}
