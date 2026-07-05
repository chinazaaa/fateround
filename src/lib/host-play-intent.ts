/**
 * Host-play intent — carries the host's create-screen choices ("Your name" and
 * "Host & play" vs "Host only") into the host panel.
 *
 * The host panel is game-specific: each game view owns its own host-mode key and
 * its own join-name input. Rather than reach into ~20 different localStorage keys
 * from the create screen, we stash one generic intent here at create time. Each
 * host view consumes it once on mount and translates it into that game's own
 * host-mode + prefilled join name. Consuming clears it, so the host's later
 * manual changes (and each game's persisted host-mode key) win on refresh.
 *
 * Purely client-side — no backend or DB fields (game codes are unique per game,
 * so there's no cross-game collision).
 */

export type HostPlayRole = 'play' | 'host'

export interface HostPlayIntent {
  /** Display name the host typed on the create screen (may be empty). */
  name: string
  /** 'play' → join as a player (Host & play); 'host' → spectate (Host only). */
  role: HostPlayRole
}

const intentKey = (gameCode: string) => `host_play_intent_${gameCode}`

export function setHostPlayIntent(gameCode: string, intent: HostPlayIntent): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(intentKey(gameCode), JSON.stringify({ name: intent.name, role: intent.role }))
  } catch {
    // localStorage can throw in private mode / when full — the host just types their name on the panel.
  }
}

/**
 * Read the host's create-screen intent and clear it (one-time). Returns null if
 * none was stored. Call once from a host view's mount effect; the returned role
 * should be mirrored into that game's own host-mode key so it survives refresh.
 */
export function consumeHostPlayIntent(gameCode: string): HostPlayIntent | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = localStorage.getItem(intentKey(gameCode))
    if (raw != null) localStorage.removeItem(intentKey(gameCode))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HostPlayIntent>
    const role: HostPlayRole = parsed.role === 'host' ? 'host' : 'play'
    return { name: typeof parsed.name === 'string' ? parsed.name : '', role }
  } catch {
    return null
  }
}
