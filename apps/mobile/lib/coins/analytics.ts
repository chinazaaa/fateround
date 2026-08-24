/**
 * Minimal mobile telemetry shim for coin events. The mobile app has no GA
 * bindings yet — server-side telemetry catches most events — but the plan
 * requires the coin panel + shop surfaces to emit shop_*, inline_purchase_*,
 * and shop_item_equipped on both platforms. Logging to console lets the
 * events land in whatever device-log capture is used until a proper client
 * emitter ships.
 *
 * Names mirror `GA_EVENTS` in `src/lib/analytics.ts` verbatim so a future
 * emitter can forward them without a renaming pass.
 */

export const COIN_EVENTS = {
  signupCoinCtaShown: 'signup_coin_cta_shown',
  signupCoinCtaClicked: 'signup_coin_cta_clicked',
  coinsEarned: 'coins_earned',
  coinsEarnedGuest: 'coins_earned_guest',
  coinHistoryViewed: 'coin_history_viewed',
  shopViewed: 'shop_viewed',
  shopItemViewed: 'shop_item_viewed',
  shopItemPurchaseStarted: 'shop_item_purchase_started',
  shopItemPurchased: 'shop_item_purchased',
  shopItemPurchaseFailed: 'shop_item_purchase_failed',
  shopItemEquipped: 'shop_item_equipped',
  inlinePurchaseOffered: 'inline_purchase_offered',
  inlinePurchaseConfirmed: 'inline_purchase_confirmed',
} as const

type EventName = (typeof COIN_EVENTS)[keyof typeof COIN_EVENTS] | (string & {})

export function trackCoinEvent(name: EventName, params: Record<string, unknown>): void {
  // Deliberately not throwing on missing sink — telemetry must never take
  // down a UI surface.
  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    // eslint-disable-next-line no-console
    console.log('[coin-event]', name, params)
  }
}
