'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useProfile } from '@/hooks/useProfile'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Top-right coin balance chip (`docs/coins-and-shop-plan.md` §"UI surfaces").
 *
 * Rendered on non-in-game screens only. Hidden for guests entirely — guests
 * never see a balance (plan §"No profile, no visible balance").
 *
 * Phase 2: taps route to the profile balance card. Phase 3 will re-route to
 * the shop and rewire the icon/long-press to the ledger.
 */
type Props = {
  /** Which design-system scope (matches ProfileChip). */
  tone?: 'site' | 'app'
}

export function CoinChip({ tone = 'site' }: Props) {
  const { profile, refresh } = useProfile()
  const [pulse, setPulse] = useState(false)

  // Refetch the profile whenever a coin credit lands — the ticker feels alive.
  useEffect(() => {
    return onCoinsAwarded(() => {
      setPulse(true)
      refresh()
      const t = window.setTimeout(() => setPulse(false), 1200)
      return () => window.clearTimeout(t)
    })
  }, [refresh])

  // Hide for guests and for callers with no session yet.
  if (!profile || profile.is_anonymous) return null

  const coins = Number(profile.coins ?? 0)

  const base =
    tone === 'app'
      ? 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3 text-sm font-semibold text-body transition-colors hover:border-[var(--border-strong)]'
      : 'fr-nav-btn'

  return (
    <Link
      href="/profile?tab=coins"
      className={`${base} ${pulse ? 'ring-2 ring-[var(--primary)]' : ''}`}
      aria-label={`${coins} coins`}
      title={`${coins} coins`}
      prefetch={false}
    >
      <span aria-hidden>🪙</span>
      <span className="tabular-nums">{coins.toLocaleString()}</span>
    </Link>
  )
}
