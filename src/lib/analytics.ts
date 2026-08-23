/**
 * Lightweight, SSR-safe wrapper around Google Analytics (gtag).
 *
 * The gtag snippet is loaded once in the root layout. This helper lets any
 * client component fire a GA event without touching `window` directly. It
 * no-ops on the server and whenever gtag hasn't loaded (e.g. local dev, or a
 * preview build with no Measurement ID), so it's always safe to call.
 *
 * Event names are snake_case to match GA4 conventions. Keep the set small and
 * stable — each one can be promoted to a "key event" (conversion) in the GA UI.
 */

type GtagEventParams = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    gtag?: (command: 'event' | 'config' | 'js', targetOrEvent: string, params?: GtagEventParams) => void
  }
}

/** Fire a GA4 event. Safe to call anywhere on the client; no-ops if GA isn't present. */
export function trackEvent(eventName: string, params?: GtagEventParams): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params)
}

/**
 * Canonical event names. Using these constants (rather than raw strings)
 * keeps the code and the GA key-event configuration in sync.
 */
export const GA_EVENTS = {
  /** Host created a new game (primary conversion). */
  createGame: 'create_game',
  /** A player joined a game via code/link to play (viral conversion). Distinct
   * from joining a persistent "room" (the anonymous-rooms feature). */
  joinGame: 'join_game',
  /** Someone copied/shared an invite link. */
  shareLink: 'share_link',
  /** Coins credited to a profile ledger (mirrors `coins_earned` in
   * `docs/coins-analytics-events.md`). Fired client-side when the finished
   * screen renders an earning line. */
  coinsEarned: 'coins_earned',
  /** Coins pending on `guest_pending_grants` for a device.
   * (`coins_earned_guest` in the analytics catalog.) */
  coinsEarnedGuest: 'coins_earned_guest',
  /** The "Sign up to claim X coins" CTA rendered on a results screen. */
  signupCoinCtaShown: 'signup_coin_cta_shown',
  /** Player tapped the "Sign up to claim X coins" CTA. */
  signupCoinCtaClicked: 'signup_coin_cta_clicked',
  /** A new signup consumed guest_pending_grants into their profile ledger. */
  guestGrantsMigrated: 'guest_grants_migrated',
  /** The 100-coin welcome grant landed. */
  welcomeGrantDelivered: 'welcome_grant_delivered',
  /** The itemized retro-backfill welcome screen rendered for the first time. */
  launchBackfillWelcomeShown: 'launch_backfill_welcome_shown',
  /** Player closed the itemized welcome screen. */
  launchBackfillWelcomeDismissed: 'launch_backfill_welcome_dismissed',
  /** The Coin History surface opened. */
  coinHistoryViewed: 'coin_history_viewed',
  /** Shop page loaded (`docs/coins-analytics-events.md` §"Spending"). */
  shopViewed: 'shop_viewed',
  /** A shop tile scrolled into view or was opened. */
  shopItemViewed: 'shop_item_viewed',
  /** Buy button tapped; confirm dialog now visible. */
  shopItemPurchaseStarted: 'shop_item_purchase_started',
  /** Purchase confirmed and ledger written. */
  shopItemPurchased: 'shop_item_purchased',
  /** Purchase attempt failed. */
  shopItemPurchaseFailed: 'shop_item_purchase_failed',
  /** Owned cosmetic equipped. */
  shopItemEquipped: 'shop_item_equipped',
  /** Inline coin gate rendered (e.g. "Add bot — 50 coins" button visible). */
  inlinePurchaseOffered: 'inline_purchase_offered',
  /** Inline coin gate purchase completed. */
  inlinePurchaseConfirmed: 'inline_purchase_confirmed',
} as const
