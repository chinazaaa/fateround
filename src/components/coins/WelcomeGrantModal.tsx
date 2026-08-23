'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { useProfile } from '@/hooks/useProfile'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

/**
 * One-time itemized welcome screen (plan §"Backfill methodology" → "Delivery",
 * plan §"Default coins for new profiles").
 *
 * Two flavours use the same modal:
 *   1. `launch_grant_v1` (retro-backfill for existing players) — itemized breakdown
 *      from the ledger row's `metadata` jsonb (written by `grant_launch_v1`).
 *   2. `welcome_v1` + optional `guest_migration` (new signup) — smaller card
 *      showing the 100-coin welcome + any migrated guest balance.
 *
 * The "mark as seen" flag lives in localStorage so the modal never reappears
 * for a profile that already saw it. Per-profile keys keep it correct on a
 * shared browser where two profiles sign in on the same device.
 */
type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  metadata: {
    trophies?: number
    daily_challenges?: number
    tournaments_placed?: number
    games_finished?: number
    welcome_flat?: number
    granted?: number
    raw_total?: number
    per_reason?: Record<string, number>
  } | null
  created_at: string
}

type Payload = {
  hasGrant: boolean
  launch: LedgerRow | null
  welcome: LedgerRow | null
  migration: LedgerRow | null
}

function storageKey(profileId: string, kind: 'launch' | 'welcome'): string {
  return `fateround_coins_welcome_seen:${kind}:${profileId}`
}

export function WelcomeGrantModal() {
  const { profile } = useProfile()
  const [payload, setPayload] = useState<Payload | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const openedAtRef = useRef<number | null>(null)

  useEffect(() => {
    // Reset per profile: a shared browser can switch accounts, and a
    // dangling `dismissed=true` from the previous profile must not
    // suppress THIS profile's welcome screen. Also ignore a late response
    // for the previous profile.
    setPayload(null)
    setDismissed(false)
    openedAtRef.current = null
    if (!profile || profile.is_anonymous) return
    let cancelled = false
    void (async () => {
      const headers = await authHeaders()
      if (!headers || cancelled) return
      const res = await fetch('/api/profile/coins/welcome', { headers })
      if (!res.ok || cancelled) return
      const body = (await res.json()) as Payload
      if (!cancelled) setPayload(body)
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.is_anonymous])

  const kind: 'launch' | 'welcome' | null = useMemo(() => {
    if (!payload) return null
    if (payload.launch) return 'launch'
    if (payload.welcome) return 'welcome'
    return null
  }, [payload])

  const shouldShow = useMemo(() => {
    if (!profile || !kind || dismissed) return false
    try {
      return !localStorage.getItem(storageKey(profile.id, kind))
    } catch {
      return true
    }
  }, [profile, kind, dismissed])

  useEffect(() => {
    if (!shouldShow || !kind || !payload) return
    if (openedAtRef.current !== null) return
    openedAtRef.current = Date.now()
    if (kind === 'launch') {
      trackEvent(GA_EVENTS.launchBackfillWelcomeShown, {
        granted_amount: payload.launch?.delta ?? 0,
      })
    } else if (kind === 'welcome') {
      trackEvent(GA_EVENTS.welcomeGrantDelivered, {
        granted_amount: payload.welcome?.delta ?? 0,
        plus_guest_migration_amount: payload.migration?.delta ?? 0,
      })
    }
  }, [shouldShow, kind, payload])

  if (!shouldShow || !kind || !payload || !profile) return null

  const close = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey(profile.id, kind), String(Date.now()))
    } catch {
      // no-op — an unclosable modal is still less bad than a broken close.
    }
    const dwellMs = openedAtRef.current ? Date.now() - openedAtRef.current : 0
    if (kind === 'launch') {
      trackEvent(GA_EVENTS.launchBackfillWelcomeDismissed, { dwell_ms: dwellMs })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fateround-welcome-title"
    >
      <div className="glass-card-strong max-w-md w-full p-6 space-y-4">
        {kind === 'launch' ? <LaunchBreakdown row={payload.launch!} /> : <WelcomeBreakdown payload={payload} />}
        <div className="flex justify-end">
          <button type="button" onClick={close} className="fr-btn--primary px-5 py-2">
            Sweet — let&apos;s go
          </button>
        </div>
      </div>
    </div>
  )
}

function LaunchBreakdown({ row }: { row: LedgerRow }) {
  const m = row.metadata ?? {}
  const trophies = Number(m.trophies ?? 0)
  const dailies = Number(m.daily_challenges ?? 0)
  const tournaments = Number(m.tournaments_placed ?? 0)
  const games = Number(m.games_finished ?? 0)
  const welcome = Number(m.welcome_flat ?? 100)
  const granted = Number(m.granted ?? row.delta)

  // Same coefficients as `_launch_grant_v1_amount()`. Displayed pre-cap; the
  // total below shows the actual credit (capped at 2000).
  const items = [
    { label: 'Trophies', count: trophies, per: 5, subtotal: 5 * trophies },
    { label: 'Daily challenges', count: Math.min(dailies, 100), per: 3, subtotal: 3 * Math.min(dailies, 100) },
    { label: 'Tournament placements', count: tournaments, per: 25, subtotal: 25 * tournaments },
    {
      label: 'Games finished',
      count: Math.min(games, 500),
      per: 1,
      subtotal: 1 * Math.min(games, 500),
    },
  ].filter((it) => it.count > 0)

  return (
    <>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
          Welcome bonus for everything you&apos;ve played
        </p>
        <h2 id="fateround-welcome-title" className="text-3xl font-black text-body">
          <span aria-hidden>🪙 </span>
          {granted.toLocaleString()} coins
        </h2>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between text-muted">
            <span>
              {it.count.toLocaleString()} {it.label.toLowerCase()} × {it.per}
            </span>
            <span className="tabular-nums font-semibold text-body">+{it.subtotal.toLocaleString()}</span>
          </li>
        ))}
        <li className="flex items-center justify-between text-muted">
          <span>Welcome bonus</span>
          <span className="tabular-nums font-semibold text-body">+{welcome.toLocaleString()}</span>
        </li>
        <li className="flex items-center justify-between border-t border-[var(--border)] pt-1.5">
          <span className="font-bold text-body">Total</span>
          <span className="tabular-nums font-black text-body">+{granted.toLocaleString()}</span>
        </li>
      </ul>
      <p className="text-xs text-muted">
        This is a one-time bonus for players who joined before coins launched. Shop opens next.
      </p>
    </>
  )
}

function WelcomeBreakdown({ payload }: { payload: Payload }) {
  const welcome = Number(payload.welcome?.delta ?? 100)
  const migration = Number(payload.migration?.delta ?? 0)
  const total = welcome + migration
  return (
    <>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Welcome to FateRound</p>
        <h2 id="fateround-welcome-title" className="text-3xl font-black text-body">
          <span aria-hidden>🪙 </span>
          {total.toLocaleString()} coins
        </h2>
      </div>
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center justify-between text-muted">
          <span>Welcome bonus</span>
          <span className="tabular-nums font-semibold text-body">+{welcome.toLocaleString()}</span>
        </li>
        {migration > 0 && (
          <li className="flex items-center justify-between text-muted">
            <span>From games you played as a guest</span>
            <span className="tabular-nums font-semibold text-body">+{migration.toLocaleString()}</span>
          </li>
        )}
        <li className="flex items-center justify-between border-t border-[var(--border)] pt-1.5">
          <span className="font-bold text-body">Total</span>
          <span className="tabular-nums font-black text-body">+{total.toLocaleString()}</span>
        </li>
      </ul>
      <p className="text-xs text-muted">Coins are for cosmetics and unlocks — never advantages inside a game.</p>
    </>
  )
}
