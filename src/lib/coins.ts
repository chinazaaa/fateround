/**
 * Shared coin-economy constants and helpers.
 *
 * The category list must stay in lockstep with the CHECK constraint on
 * `coin_ledger.admin_category` (see
 * `supabase/migrations/20261101120000_coins_foundation.sql`). Editing one
 * without the other silently breaks the admin adjust flow, so both sides
 * point at this file in comment.
 */

export const COIN_ADMIN_CATEGORIES = [
  'bug_reimbursement',
  'support_goodwill',
  'promotion',
  'correction',
  'other',
] as const
export type CoinAdminCategory = (typeof COIN_ADMIN_CATEGORIES)[number]

export const COIN_ADMIN_CATEGORY_LABELS: Record<CoinAdminCategory, string> = {
  support_goodwill: 'Support goodwill',
  bug_reimbursement: 'Bug reimbursement',
  promotion: 'Promotion',
  correction: 'Correction / clawback',
  other: 'Other',
}

/** 5 000 coins per admin per 24h. See `admin_adjust_coins(...)`. */
export const ADMIN_DAILY_CAP_COINS = 5_000

/** Min characters on an admin-adjustment note (mirrors DB check). */
export const ADMIN_NOTE_MIN_LENGTH = 10
