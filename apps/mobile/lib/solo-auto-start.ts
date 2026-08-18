import * as SecureStore from 'expo-secure-store'

/**
 * Solo auto-start intent — mobile parallel of the web helper at
 * `src/lib/solo-auto-start.ts`. Set from the create screen when the host opts
 * into "Play solo" (or from the host lobby's Play Again on a 1-seat game),
 * consumed inside the host lobby once the host is seated in a game that's
 * still `waiting`. Its presence tells the lobby to POST `/start` automatically
 * so a solo game skips the lobby wait entirely.
 *
 * One-shot per game code so it can only fire for the game it was set for.
 * SecureStore is used to match this app's existing per-gameCode client
 * storage (see `lib/secure-session.ts`, `lib/game-templates.ts`) — the value
 * itself isn't sensitive, but sticking to one storage layer keeps the surface
 * consistent.
 */

const key = (gameCode: string) => `solo_auto_start_${gameCode.toUpperCase()}`

export async function setSoloAutoStart(gameCode: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key(gameCode), '1')
  } catch {
    // Best effort — a store failure just means the host lands in the lobby
    // and taps Start manually.
  }
}

export async function hasSoloAutoStart(gameCode: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key(gameCode))) === '1'
  } catch {
    return false
  }
}

export async function clearSoloAutoStart(gameCode: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key(gameCode))
  } catch {
    // ignore
  }
}
