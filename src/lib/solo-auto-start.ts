/**
 * Solo auto-start intent — set from the create screen when the host opts into
 * "Play solo", consumed inside `useHostSeat` once the host is seated in a game
 * that's still `waiting`. Its presence tells the host panel to POST `/start`
 * automatically so a solo game skips the lobby wait entirely.
 *
 * Kept as a one-shot flag keyed by game code so it can only fire for the game
 * it was set for, and only the first time the host seats in.
 */

const key = (gameCode: string) => `solo_auto_start_${gameCode}`

export function setSoloAutoStart(gameCode: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key(gameCode), '1')
  } catch {
    // Best effort — a private-mode host just sees the lobby and clicks Start.
  }
}

export function hasSoloAutoStart(gameCode: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(key(gameCode)) === '1'
  } catch {
    return false
  }
}

export function clearSoloAutoStart(gameCode: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key(gameCode))
  } catch {
    // ignore
  }
}
