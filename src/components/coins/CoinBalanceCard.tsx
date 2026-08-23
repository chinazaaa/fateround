'use client'

import { useProfile } from '@/hooks/useProfile'
import Link from 'next/link'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

/**
 * Prominent coin balance card at the top of the profile page (plan §"UI surfaces"
 * → "Profile balance card"). Two buttons: "View history" jumps to the Coin
 * History tab, "View shop" is a Phase 3 placeholder — disabled + a "Coming soon"
 * hover title until then.
 *
 * Hidden for guests (they never see a balance).
 */
export function CoinBalanceCard({ onViewHistory }: { onViewHistory?: () => void }) {
  const { profile } = useProfile()
  if (!profile || profile.is_anonymous) return null

  const coins = Number(profile.coins ?? 0)

  return (
    <div className="glass-card-strong p-5 sm:p-6 space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Your coins</p>
        <p className="text-4xl sm:text-5xl font-black tabular-nums text-body">
          <span aria-hidden>🪙 </span>
          {coins.toLocaleString()}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/profile?tab=coins"
          onClick={() => {
            onViewHistory?.()
            trackEvent(GA_EVENTS.coinHistoryViewed, { entry_point: 'profile_card' })
          }}
          prefetch={false}
          className="fr-btn--nav"
        >
          View history
        </Link>
        <button
          type="button"
          disabled
          className="fr-btn--nav opacity-60 cursor-not-allowed"
          title="Shop opens next (Phase 3)"
        >
          View shop
        </button>
      </div>
    </div>
  )
}
