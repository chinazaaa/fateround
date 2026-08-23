'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoinAwardWire } from '@/lib/coins/earn-events'
import { onCoinsAwarded, onGuestCoinsPending } from '@/lib/coins/earn-events'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

/**
 * End-of-game coin panel (`docs/coins-and-shop-plan.md` §"UI surfaces" and
 * §"Earning"). One row per reason that fired for this game, plus a total.
 *
 * Listens for `coins-awarded` (profiled players) OR `guest-coins-pending`
 * (guests). The two paths render the same panel — the plan says web ↔ mobile
 * parity is a real requirement AND profiled vs guest should feel identical
 * beyond the sign-up CTA.
 *
 * A game whose only credit was blocked by the 2-human floor renders a
 * "No coins — needs 2 human players" line so the surface isn't silent.
 */
type Props = {
  /** The game code, used to scope the "this game" listener. */
  gameCode?: string | null
}

export function CoinAwardPanel({ gameCode }: Props) {
  const [coins, setCoins] = useState<CoinAwardWire | null>(null)
  const [guestCoins, setGuestCoins] = useState<CoinAwardWire | null>(null)
  const [ctaSeen, setCtaSeen] = useState(false)

  useEffect(() => {
    // Reset when the panel is re-scoped to a new game (play-again mid-tab,
    // navigating between rooms). Without this the previous game's total
    // stays on screen until a new matching event lands, and `ctaSeen` would
    // suppress the impression event for the next guest CTA.
    setCoins(null)
    setGuestCoins(null)
    setCtaSeen(false)
    const offCoins = onCoinsAwarded((payload, code) => {
      if (!gameCode || !code || code === gameCode) setCoins(payload)
    })
    const offGuest = onGuestCoinsPending((payload, code) => {
      if (!gameCode || !code || code === gameCode) setGuestCoins(payload)
    })
    return () => {
      offCoins()
      offGuest()
    }
  }, [gameCode])

  const shown = coins ?? guestCoins
  const isGuest = !coins && Boolean(guestCoins)

  useEffect(() => {
    if (isGuest && guestCoins && !ctaSeen) {
      trackEvent(GA_EVENTS.signupCoinCtaShown, {
        pending_amount: guestCoins.total,
        game_id: gameCode ?? undefined,
      })
      setCtaSeen(true)
    }
  }, [isGuest, guestCoins, ctaSeen, gameCode])

  if (!shown) return null

  const anyCredit = shown.total > 0
  const lines = shown.lines ?? []

  return (
    <div className="glass-card p-4 sm:p-5 space-y-3" data-testid="coin-award-panel">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Coins earned</div>
        <div className="text-2xl font-black tabular-nums text-body">
          <span aria-hidden>🪙 </span>
          {anyCredit ? `+${shown.total.toLocaleString()}` : '0'}
        </div>
      </div>
      {lines.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {lines.map((line, i) => (
            <li key={`${line.reason}-${i}`} className="flex items-center justify-between text-muted">
              <span>{line.label}</span>
              <span className="tabular-nums font-semibold text-body">
                {line.credited > 0 ? `+${line.credited}` : line.requested > line.credited ? '—' : `+${line.requested}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Needs 2 human players to earn coins.</p>
      )}
      {isGuest && anyCredit && <GuestSignupCta pendingAmount={shown.total} gameCode={gameCode} />}
    </div>
  )
}

function GuestSignupCta({ pendingAmount, gameCode }: { pendingAmount: number; gameCode: string | null | undefined }) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))] px-3 py-2.5">
      <p className="text-sm font-semibold text-body">Sign up to claim {pendingAmount.toLocaleString()} coins</p>
      <Link
        href="/profile?signup=1"
        prefetch={false}
        className="fr-btn--primary text-xs px-3 py-1.5"
        onClick={() =>
          trackEvent(GA_EVENTS.signupCoinCtaClicked, {
            pending_amount: pendingAmount,
            game_id: gameCode ?? undefined,
          })
        }
      >
        Save
      </Link>
    </div>
  )
}
