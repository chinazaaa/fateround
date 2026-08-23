/**
 * Minimal mobile telemetry shim for coin events. The mobile app has no GA
 * bindings yet — server-side telemetry catches most events — but the plan
 * requires the coin panel to emit `signup_coin_cta_shown`/`_clicked` on
 * both platforms. Logging to console lets the events land in whatever
 * device-log capture is used until a proper client emitter ships.
 */

export const COIN_EVENTS = {
  signupCoinCtaShown: 'signup_coin_cta_shown',
  signupCoinCtaClicked: 'signup_coin_cta_clicked',
  coinsEarned: 'coins_earned',
  coinsEarnedGuest: 'coins_earned_guest',
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
