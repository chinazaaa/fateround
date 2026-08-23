/**
 * Bus for "coins just landed for this game", mirroring `trophies/earned-events.ts`.
 *
 * The finish-screen coin panel and the top-right coin chip both react to
 * these events: the panel renders the itemized breakdown for the finished
 * game, and the chip animates the balance ticker.
 */
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

export type CoinAwardLineWire = {
  reason: string
  requested: number
  credited: number
  label: string
}

export type CoinAwardWire = {
  lines: CoinAwardLineWire[]
  total: number
  uniqueHumans?: number
}

const COINS_EVENT = 'fateround-coins-awarded'
const GUEST_COINS_EVENT = 'fateround-guest-coins-pending'

export function emitCoinsAwarded(payload: unknown, gameCode?: string, gameType?: string): void {
  if (typeof window === 'undefined' || !payload) return
  const coins = payload as CoinAwardWire
  window.dispatchEvent(new CustomEvent(COINS_EVENT, { detail: { coins, gameCode, gameType } }))

  // Analytics — one event per credited line (mirrors `coins_earned` in the
  // catalog). Zero-credit lines do NOT fire coins_earned; they are covered by
  // `coins_grant_gated` which the server RPC would emit if we were writing
  // its telemetry — this client fires it as a best-effort mirror.
  for (const line of coins.lines ?? []) {
    if (line.credited > 0) {
      trackEvent(GA_EVENTS.coinsEarned, {
        amount: line.credited,
        reason: line.reason,
        game_type: gameType,
        ref_id: gameCode,
        player_count: coins.uniqueHumans,
      })
    }
  }
}

export function onCoinsAwarded(
  handler: (coins: CoinAwardWire, gameCode?: string, gameType?: string) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { coins?: CoinAwardWire; gameCode?: string; gameType?: string }
      | undefined
    if (detail?.coins) handler(detail.coins, detail.gameCode, detail.gameType)
  }
  window.addEventListener(COINS_EVENT, listener)
  return () => window.removeEventListener(COINS_EVENT, listener)
}

export function emitGuestCoinsPending(payload: unknown, gameCode?: string): void {
  if (typeof window === 'undefined' || !payload) return
  const guest = payload as CoinAwardWire
  window.dispatchEvent(new CustomEvent(GUEST_COINS_EVENT, { detail: { guest, gameCode } }))

  for (const line of guest.lines ?? []) {
    if (line.credited > 0) {
      trackEvent(GA_EVENTS.coinsEarnedGuest, {
        amount: line.credited,
        reason: line.reason,
        game_id: gameCode,
      })
    }
  }
}

export function onGuestCoinsPending(handler: (guest: CoinAwardWire, gameCode?: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as { guest?: CoinAwardWire; gameCode?: string } | undefined
    if (detail?.guest) handler(detail.guest, detail.gameCode)
  }
  window.addEventListener(GUEST_COINS_EVENT, listener)
  return () => window.removeEventListener(GUEST_COINS_EVENT, listener)
}
