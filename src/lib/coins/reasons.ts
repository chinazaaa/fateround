/**
 * Coin-earning constants — a single source of truth for reason strings and
 * starter amounts. Server-side call sites and client-side panels both import
 * from here so a tuning change never drifts one path from the other.
 *
 * Amounts match `docs/coins-and-shop-plan.md` §"Coin-earning starter numbers".
 * Reason strings mirror the enum in `coin_ledger.reason` (see the foundation
 * migration).
 */

export const COIN_REASONS = {
  win: 'win',
  dailyChallenge: 'daily_challenge',
  streakMultiplier: 'streak_multiplier',
  tournamentPlacement: 'tournament_placement',
  hostBounty: 'host_bounty',
  firstModeBonus: 'first_mode_bonus',
  launchGrantV1: 'launch_grant_v1',
  welcomeV1: 'welcome_v1',
  guestMigration: 'guest_migration',
  adminAdjustment: 'admin_adjustment',
  shopPurchase: 'shop_purchase',
  refund: 'refund',
} as const

export type CoinReason = (typeof COIN_REASONS)[keyof typeof COIN_REASONS]

/** Starter values — see plan §"Coin-earning starter numbers". */
export const COIN_AMOUNTS = {
  winBase: 15,
  fullLobbyBonus: 10,
  fullLobbyThreshold: 5,
  dailyChallenge: 30,
  firstModeBonus: 50,
  hostBounty: 25,
  hostBountyRounds: 5,
  tournamentPerGame: 5,
  tournamentPlacement: { 1: 100, 2: 50, 3: 25 } as Record<number, number>,
} as const

/**
 * Streak multiplier ramp — x1.0 → x2.0 across 30 days.
 * Returns the multiplier to apply to a daily-challenge award for the given
 * current streak length (in days). The multiplier is applied by the caller,
 * not by the RPC — the RPC is authoritative on the base amount and the
 * anti-farm gate, but the streak state lives on the profile row.
 */
export function streakMultiplier(streakDays: number): number {
  if (!Number.isFinite(streakDays) || streakDays <= 0) return 1
  const capped = Math.min(streakDays, 30)
  return 1 + capped / 30
}

/** Human-readable label per reason — used by the coin history table. */
export const COIN_REASON_LABEL: Record<string, string> = {
  win: 'Won a round',
  daily_challenge: 'Daily challenge',
  streak_multiplier: 'Streak bonus',
  tournament_placement: 'Tournament placement',
  host_bounty: 'Host bounty',
  first_mode_bonus: 'First-time mode bonus',
  launch_grant_v1: 'Launch bonus',
  welcome_v1: 'Welcome bonus',
  guest_migration: 'Guest play migrated',
  admin_adjustment: 'Adjustment by support',
  shop_purchase: 'Shop purchase',
  refund: 'Refund',
}

/** Filter buckets exposed by the Coin History filter dropdown. */
export const COIN_HISTORY_FILTERS = {
  all: 'All',
  earned: 'Earned',
  spent: 'Spent',
  refund: 'Refund',
  admin: 'Support / admin',
} as const

export type CoinHistoryFilter = keyof typeof COIN_HISTORY_FILTERS

export function reasonInFilter(reason: string, filter: CoinHistoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'refund') return reason === 'refund'
  if (filter === 'admin') return reason === 'admin_adjustment'
  if (filter === 'spent') return reason === 'shop_purchase'
  // 'earned' — anything that credited that isn't a refund/admin/spend.
  return (
    reason !== 'shop_purchase' && reason !== 'admin_adjustment' && reason !== 'refund'
  )
}
