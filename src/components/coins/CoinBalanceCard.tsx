'use client'

import { useProfile } from '@/hooks/useProfile'
import Link from 'next/link'

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
          // ?entry=profile_card lets CoinHistoryTab attribute the view
          // correctly; the tab is the single place that emits
          // `coin_history_viewed`, so this Link no longer fires its own
          // event (used to double-count clicks from the card).
          href="/profile?tab=coins&entry=profile_card"
          onClick={() => onViewHistory?.()}
          prefetch={false}
          className="fr-btn--nav"
        >
          View history
        </Link>
        <Link href="/shop" prefetch={false} className="fr-btn--nav">
          View shop
        </Link>
      </div>
    </div>
  )
}
