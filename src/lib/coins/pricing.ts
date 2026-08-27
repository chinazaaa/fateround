/**
 * Shared coin-pricing constants.
 *
 * `MAX_PRICE_COINS` mirrors the ceiling `purchase_item()` enforces in
 * `supabase/migrations/20261101120600_coins_shop_phase3.sql` (10 000
 * coins). Any admin surface that lets a human set `price_coins` on a
 * shop-purchasable row must clamp against the same ceiling so a UI
 * write can't race past what the RPC would ever accept — a mismatch
 * would surface as a raw "price for kind X exceeds ceiling" exception
 * at purchase time instead of a clean 400 at write time.
 *
 * Single source of truth: bump this constant + the RPC's `10000`
 * literal together in one PR.
 */
export const MAX_PRICE_COINS = 10_000
