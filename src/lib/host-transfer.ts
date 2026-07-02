/**
 * Claim-based host transfer — shared client helpers.
 *
 * When a host nominates a successor, we remember the nominee's name locally. That lets the
 * outgoing host's screen say "Host transferred to <name>" (instead of a bare access-denied)
 * once their token stops working — the demoted host knows who they handed off to, so no
 * extra server state is needed to name the new host.
 */
export function nomineeStorageKey(gameCode: string): string {
  return `host_transfer_nominee_${gameCode.toUpperCase()}`
}

export function rememberNominee(gameCode: string, name: string | null): void {
  if (typeof window === 'undefined') return
  const key = nomineeStorageKey(gameCode)
  if (name) window.localStorage.setItem(key, name)
  else window.localStorage.removeItem(key)
}

export function readNominee(gameCode: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(nomineeStorageKey(gameCode))
}
