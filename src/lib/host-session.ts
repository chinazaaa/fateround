/**
 * Local persistence of a game's host token so the host can reopen `/host/[code]` on the
 * same device without the saved host link. Mirrors the tournament host-token pattern
 * (`tournament_host_<code>`). The token still lives in the URL for the primary flow and
 * for sharing the panel to another device — this is a same-device convenience/recovery
 * so a host who closes or reloads the tab isn't stranded.
 */
const hostTokenKey = (code: string) => `game_host_${code.toUpperCase()}`

export function rememberHostToken(code: string, token: string): void {
  if (typeof window === 'undefined' || !code || !token) return
  try {
    localStorage.setItem(hostTokenKey(code), token)
  } catch {
    // Ignore storage failures (private mode / quota) — the URL token still works.
  }
}

export function readHostToken(code: string): string | null {
  if (typeof window === 'undefined' || !code) return null
  try {
    return localStorage.getItem(hostTokenKey(code))
  } catch {
    return null
  }
}

export function clearHostToken(code: string): void {
  if (typeof window === 'undefined' || !code) return
  try {
    localStorage.removeItem(hostTokenKey(code))
  } catch {
    // Ignore — nothing to recover from a failed removal.
  }
}
