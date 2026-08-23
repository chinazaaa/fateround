'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useProfile } from '@/hooks/useProfile'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Top-right coin balance chip (`docs/coins-and-shop-plan.md` §"UI surfaces").
 *
 * Rendered on non-in-game screens only. Hidden for guests entirely — guests
 * never see a balance (plan §"No profile, no visible balance").
 *
 * Phase 3: taps route to the shop (the primary spend surface). The Coin
 * History destination stays reachable from the profile balance card's
 * "View history" button.
 */
type Props = {
  /** Which design-system scope (matches ProfileChip). */
  tone?: 'site' | 'app'
}

export function CoinChip({ tone = 'site' }: Props) {
  const { profile, refresh } = useProfile()
  const [pulse, setPulse] = useState(false)
  // The inner function returned by an `onCoinsAwarded` handler is DISCARDED
  // (the emitter API takes no cleanup callback). A ref-tracked timeout is
  // the only way to clear the previous pulse before starting the next one —
  // and to clear on unmount so `setState` never fires after the chip is
  // torn down (two credits within 1.2s + a fast route away → warning
  // otherwise).
  const pulseTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const off = onCoinsAwarded(() => {
      if (!mountedRef.current) return
      setPulse(true)
      refresh()
      if (pulseTimerRef.current != null) window.clearTimeout(pulseTimerRef.current)
      pulseTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setPulse(false)
        pulseTimerRef.current = null
      }, 1200)
    })
    return () => {
      mountedRef.current = false
      if (pulseTimerRef.current != null) {
        window.clearTimeout(pulseTimerRef.current)
        pulseTimerRef.current = null
      }
      off()
    }
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
      href="/shop"
      className={`${base} ${pulse ? 'ring-2 ring-[var(--primary)]' : ''}`}
      aria-label={`${coins} coins — open shop`}
      title={`${coins} coins`}
      prefetch={false}
    >
      <span aria-hidden>🪙</span>
      <span className="tabular-nums">{coins.toLocaleString()}</span>
    </Link>
  )
}
