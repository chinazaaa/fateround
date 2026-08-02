'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/identity'

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
const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function formatEarned(at: string): string {
  const d = new Date(at)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/** One game's trophies: how far along you are, your rarest, then the full list. */
export default function GameTrophiesPage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = use(params)
  const [group, setGroup] = useState<Group | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [rarest, setRarest] = useState<Trophy | null>(null)
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<string>('all')
  const [status, setStatus] = useState<'all' | 'earned' | 'locked'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (!headers) return
      // Collect anything already qualified for before reading — a trophy added to the
      // catalog after you played would otherwise sit locked at 100% until you played again.
      await fetch('/api/profile/sync', { method: 'POST', headers }).catch(() => {})
      const res = await fetch(`/api/profile/trophies?game=${encodeURIComponent(gameType)}`, { headers })
      if (!res.ok) return
      const json = await res.json()
      setGroup(json.groups?.[0] ?? null)
      setTotals(json.totals ?? null)
      setRarest(json.rarest ?? null)
    } finally {
      setLoading(false)
    }
  }, [gameType])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const list = group?.trophies ?? []
    return list.filter(
      (t) => (tier === 'all' || t.tier === tier) && (status === 'all' || (status === 'earned' ? t.earned : !t.earned))
    )
  }, [group, tier, status])

  if (loading) return <p className="mx-auto max-w-3xl p-6 text-sm text-muted">Loading…</p>

  const pct = totals?.pct ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <Link href="/profile" className="text-sm font-semibold text-muted hover:text-[var(--foreground)]">
        ← Your trophies
      </Link>

      <h1 className="text-2xl font-black tracking-tight">{group?.label ?? 'Trophies'}</h1>

      {!group || group.total === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">
          No trophies for this game yet. An admin can add them from the trophies panel.
        </p>
      ) : (
        <>
          {/* Earned · progress · available, then the tier tally — the shape a trophy list is
              read in: how far am I, and what kind of trophies are left. */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-around gap-4">
              <div className="text-center">
                <p className="text-3xl font-black">{totals?.earned ?? 0}</p>
                <p className="text-faint text-xs uppercase tracking-wide">Earned</p>
              </div>
              <ProgressRing pct={pct} />
              <div className="text-center">
                <p className="text-3xl font-black">{totals?.total ?? 0}</p>
                <p className="text-faint text-xs uppercase tracking-wide">Available</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-3 text-center">
              {(['platinum', 'gold', 'silver', 'bronze'] as const).map((t) => (
                <div key={t}>
                  <p className="text-xl" aria-hidden>
                    {TIER_EMOJI[t]}
                  </p>
                  <p className="font-black">{totals?.tiers?.[t] ?? 0}</p>
                </div>
              ))}
            </div>
          </div>

          {rarest && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Rarest trophy earned</h2>
              <TrophyRow trophy={rarest} />
            </section>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(['all', 'earned', 'locked'] as const).map((value) => (
              <Chip key={value} active={status === value} onClick={() => setStatus(value)}>
                {value === 'all' ? 'All' : value === 'earned' ? 'Earned' : 'Locked'}
              </Chip>
            ))}
            <span className="mx-1 self-center text-[var(--border-strong)]">|</span>
            {(['all', ...TIERS] as const).map((value) => (
              <Chip key={value} active={tier === value} onClick={() => setTier(value)}>
                {value === 'all' ? 'Any tier' : TIER_EMOJI[value]}
              </Chip>
            ))}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">All trophies</h2>
            {visible.length === 0 ? (
              <p className="glass-card p-5 text-sm text-muted">Nothing matches those filters.</p>
            ) : (
              <ul className="space-y-2">
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
    <div className="glass-card flex items-start gap-3 p-4">
      {/* Locked trophies show a padlock rather than a greyed medal — "not yet" reads instantly,
          where a faded medal just looks like a rendering glitch. */}
      <span className={`text-2xl ${trophy.earned ? '' : 'opacity-50'}`} aria-hidden>
        {trophy.earned ? (TIER_EMOJI[trophy.tier] ?? '🏅') : '🔒'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${trophy.earned ? '' : 'text-muted'}`}>{trophy.title}</p>
        <p className="text-sm text-muted">{trophy.description}</p>

        {!trophy.earned && trophy.progress > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset-bg)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${Math.round(trophy.progress * 100)}%` }}
            />
          </div>
        )}

        <div className="text-faint mt-1 flex flex-wrap items-center gap-x-2 text-xs">
          <span aria-hidden>{TIER_EMOJI[trophy.tier] ?? '🏅'}</span>
          <span>{plural(trophy.points, 'pt')}</span>
          {trophy.rarityPct !== null && <span>· {trophy.rarityPct}% of players</span>}
          {trophy.earned && trophy.earnedAt ? (
            <span className="ml-auto">{formatEarned(trophy.earnedAt)}</span>
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
      <span className="absolute inset-0 flex items-center justify-center text-lg font-black">{pct}%</span>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
