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
} as const
