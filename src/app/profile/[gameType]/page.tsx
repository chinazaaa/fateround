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

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const
const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * One game's trophies — the second level of the trophy list.
 *
 * `platform` is the reserved id for the cross-game set, which is a real grouping rather than a
 * game and therefore can't live under a game type.
 */
export default function GameTrophiesPage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = use(params)
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<string>('all')
  const [status, setStatus] = useState<'all' | 'earned' | 'locked'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch(`/api/profile/trophies?game=${encodeURIComponent(gameType)}`, { headers })
      if (!res.ok) return
      const json = await res.json()
      setGroup(json.groups?.[0] ?? null)
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

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/profile" className="text-sm font-semibold text-muted hover:text-[var(--foreground)]">
        ← Your trophies
      </Link>

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight">{group?.label ?? 'Trophies'}</h1>
        {group && group.total > 0 && (
          <span className="text-faint text-sm">
            {group.earned}/{group.total} · {Math.round((group.earned / group.total) * 100)}%
          </span>
        )}
      </div>

      {group && group.total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-inset-bg)]">
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${Math.round((group.earned / group.total) * 100)}%` }}
          />
        </div>
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
            {value === 'all' ? 'Any tier' : `${TIER_EMOJI[value]} ${value}`}
          </Chip>
        ))}
      </div>

      {!group || group.total === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">No trophies for this game yet.</p>
      ) : visible.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">Nothing matches those filters.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((trophy) => (
            <li
              key={trophy.id}
              className={`glass-card flex items-start gap-3 p-4 ${trophy.earned ? '' : 'opacity-80'}`}
            >
              <span className={`text-2xl ${trophy.earned ? '' : 'opacity-40 grayscale'}`} aria-hidden>
                {TIER_EMOJI[trophy.tier] ?? '🏅'}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${trophy.earned ? '' : 'text-muted'}`}>{trophy.title}</p>
                <p className="text-sm text-muted">{trophy.description}</p>

                {/* A bar only where there's distance to travel — a full one on an earned trophy
                    is noise, and the date is the more interesting fact. */}
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
      )}
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
