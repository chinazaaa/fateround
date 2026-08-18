'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/identity'
import { Skeleton } from '@/components/Skeleton'
import { Glyph } from '@/components/icons/Glyph'
import { LockIcon, ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { tierIcon } from '@/lib/game-glyphs'

type Trophy = {
  id: string
  tier: string
  title: string
  description: string
  points: number
  earned: boolean
  earnedAt: string | null
  progress: number
  rarityPct: number | null
}

type Group = { label: string; earned: number; total: number; trophies: Trophy[] }
type Totals = {
  earned: number
  total: number
  pct: number
  tiers: { bronze: number; silver: number; gold: number; platinum: number }
}

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function formatEarned(at: string): string {
  const d = new Date(at)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function GameTrophiesPage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = use(params)
  const [group, setGroup] = useState<Group | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [rarest, setRarest] = useState<Trophy | null>(null)
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<string>('all')
  const [status, setStatus] = useState<'all' | 'earned' | 'locked'>('all')

  const fetchTrophies = useCallback(
    async (headers: Record<string, string>) => {
      const res = await fetch(`/api/profile/trophies?game=${encodeURIComponent(gameType)}`, { headers })
      if (!res.ok) return
      const json = await res.json()
      setGroup(json.groups?.[0] ?? null)
      setTotals(json.totals ?? null)
      setRarest(json.rarest ?? null)
    },
    [gameType]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await authHeaders()
    if (!headers) {
      setLoading(false)
      return
    }
    try {
      await fetchTrophies(headers)
    } finally {
      setLoading(false)
    }
    await fetch('/api/profile/sync', { method: 'POST', headers }).catch(() => {})
    await fetchTrophies(headers)
  }, [fetchTrophies])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const list = group?.trophies ?? []
    return list.filter(
      (t) => (tier === 'all' || t.tier === tier) && (status === 'all' || (status === 'earned' ? t.earned : !t.earned))
    )
  }, [group, tier, status])

  if (loading) {
    return (
      <div className="fr-portal mx-auto max-w-3xl space-y-5 p-4 sm:p-6" aria-busy="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
        <div className="fr-card p-5">
          <div className="flex items-center justify-around gap-4">
            <Skeleton className="h-14 w-16" />
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-14 w-16" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <span className="sr-only">Loading trophies…</span>
      </div>
    )
  }

  const pct = totals?.pct ?? 0

  return (
    // `fr-card`/`fr-chip`/`fr-gamecard` below resolve their tokens from the `fr-*` scope
    // (fate-round-ds.css). The shared profile layout is on the app system, so this page
    // carries the scope itself — `fr-portal` rather than `fr-site` because it supplies the
    // same tokens without `fr-site`'s own background and full-viewport height.
    <div className="fr-portal mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <Link
        href="/profile"
        className="text-sm font-semibold text-[var(--primary)] hover:underline no-underline inline-flex items-center gap-1"
      >
        <Glyph icon={ArrowLeft01Icon} size={16} />
        Your trophies
      </Link>

      <h1
        className="text-3xl font-extrabold tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}
      >
        {group?.label ?? 'Trophies'}
      </h1>

      {!group || group.total === 0 ? (
        <p className="fr-card p-5 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          No trophies for this game yet. An admin can add them from the trophies panel.
        </p>
      ) : (
        <>
          <div className="fr-card p-5">
            <div className="flex items-center justify-around gap-4">
              <div className="text-center">
                <p className="text-3xl font-extrabold" style={{ color: 'var(--text)' }}>
                  {totals?.earned ?? 0}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">Earned</p>
              </div>
              <ProgressRing pct={pct} />
              <div className="text-center">
                <p className="text-3xl font-extrabold" style={{ color: 'var(--text)' }}>
                  {totals?.total ?? 0}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">Available</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-3 text-center">
              {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tierName) => (
                <div key={tierName} className="flex flex-col items-center">
                  <span className="fr-glyph text-[var(--primary)] mb-1">
                    <Glyph icon={tierIcon(tierName)} size={20} />
                  </span>
                  <p className="font-extrabold" style={{ color: 'var(--text)' }}>
                    {totals?.tiers?.[tierName] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {rarest && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
                Rarest trophy earned
              </h2>
              <TrophyRow trophy={rarest} />
            </section>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(['all', 'earned', 'locked'] as const).map((value) => (
              <Chip key={value} active={status === value} onClick={() => setStatus(value)}>
                {value === 'all' ? 'All' : value === 'earned' ? 'Earned' : 'Locked'}
              </Chip>
            ))}
            <span className="mx-1 self-center text-[var(--border)]">|</span>
            {(['all', ...TIERS] as const).map((value) => (
              <Chip key={value} active={tier === value} onClick={() => setTier(value)}>
                {value === 'all' ? 'Any tier' : value.charAt(0).toUpperCase() + value.slice(1)}
              </Chip>
            ))}
          </div>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">All trophies</h2>
            {visible.length === 0 ? (
              <p className="fr-card p-5 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                Nothing matches those filters.
              </p>
            ) : (
              <ul className="space-y-3">
                {visible.map((trophy) => (
                  <li key={trophy.id}>
                    <TrophyRow trophy={trophy} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function TrophyRow({ trophy }: { trophy: Trophy }) {
  return (
    <div className="fr-gamecard cursor-default gap-3 p-4" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <span className={`fr-glyph mt-0.5 shrink-0 ${trophy.earned ? 'text-[var(--primary)]' : 'opacity-50'}`}>
        <Glyph icon={trophy.earned ? tierIcon(trophy.tier) : LockIcon} size={22} />
      </span>
      <div className="min-w-0 flex-1 self-stretch">
        <p className={`fr-gamecard__title text-base ${trophy.earned ? '' : 'opacity-70'}`}>{trophy.title}</p>
        <p className="fr-gamecard__tagline text-xs">{trophy.description}</p>

        {!trophy.earned && trophy.progress > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset-bg)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${Math.round(trophy.progress * 100)}%` }}
            />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: 'var(--text-faint)' }}>
          <span className="font-semibold">{plural(trophy.points, 'pt')}</span>
          {trophy.rarityPct !== null && <span>· {trophy.rarityPct}% of players</span>}
          {trophy.earned && trophy.earnedAt ? (
            <span className="ml-auto text-[var(--primary)] font-semibold">{formatEarned(trophy.earnedAt)}</span>
          ) : trophy.progress > 0 ? (
            <span className="ml-auto">{Math.round(trophy.progress * 100)}% there</span>
          ) : (
            <span className="ml-auto">Locked</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 92
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, pct / 100)))}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-lg font-extrabold"
        style={{ color: 'var(--text)' }}
      >
        {pct}%
      </span>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`fr-chip fr-chip--control ${active ? 'fr-chip--active' : ''}`}
    >
      {children}
    </button>
  )
}
