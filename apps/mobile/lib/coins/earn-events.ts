import { DeviceEventEmitter } from 'react-native'

/**
 * Mobile mirror of `src/lib/coins/earn-events.ts`. Same shape, RN-native
 * event bus. Consumed by the coin panel and coin chip.
 */
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
const GUEST_EVENT = 'fateround-guest-coins-pending'

export function emitCoinsAwarded(payload: unknown, gameCode?: string, gameType?: string): void {
  if (!payload) return
  DeviceEventEmitter.emit(COINS_EVENT, { coins: payload as CoinAwardWire, gameCode, gameType })
}

export function onCoinsAwarded(
  handler: (coins: CoinAwardWire, gameCode?: string, gameType?: string) => void
): () => void {
  const sub = DeviceEventEmitter.addListener(COINS_EVENT, (detail) => {
    if (detail?.coins) handler(detail.coins as CoinAwardWire, detail.gameCode, detail.gameType)
  })
  return () => sub.remove()
}

export function emitGuestCoinsPending(payload: unknown, gameCode?: string): void {
  if (!payload) return
  DeviceEventEmitter.emit(GUEST_EVENT, { guest: payload as CoinAwardWire, gameCode })
}

export function onGuestCoinsPending(
  handler: (guest: CoinAwardWire, gameCode?: string) => void
): () => void {
  const sub = DeviceEventEmitter.addListener(GUEST_EVENT, (detail) => {
    if (detail?.guest) handler(detail.guest as CoinAwardWire, detail.gameCode)
  })
  return () => sub.remove()
}
