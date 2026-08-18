import type { GameType } from '@/types'

/**
 * Games that ship a "Practice vs Bot" mode at /play-solo/<slug>.
 *
 * Kept as a single registry so the game landing page, the home hero and any
 * future crosslink can enable the CTA in one place. Add a game here when the
 * bot page is ready — never before, or the button renders a 404.
 *
 * Slug values match the folder under `src/app/play-solo/` and the URL segment,
 * so a landing page can build the link as `/play-solo/${soloPlaySlug(type)}`.
 */
const SOLO_PLAY_SLUGS: Partial<Record<GameType, string>> = {
  whot: 'whot',
  ayo: 'ayo',
  crazy_eights: 'crazy-eights',
  uno: 'uno',
  ludo: 'ludo',
  yahtzee: 'yahtzee',
}

export function soloPlaySlug(gameType: GameType): string | null {
  return SOLO_PLAY_SLUGS[gameType] ?? null
}

export function hasSoloPlay(gameType: GameType): boolean {
  return soloPlaySlug(gameType) != null
}

/**
 * Display-ordered index of every /play-solo/<slug> surface, for site-wide
 * crosslinks that don't need the hub page's richer per-game blurb (e.g. the
 * footer). Ordered by expected engagement — matches the hub page's list order.
 * Add a new solo game here when its /play-solo/<slug> route lands, so the
 * footer picks it up in the same place as the hub.
 */
export const SOLO_PLAY_INDEX: readonly { slug: string; label: string }[] = [
  { slug: 'whot', label: 'Whot' },
  { slug: 'uno', label: 'Match Up (UNO)' },
  { slug: 'crazy-eights', label: 'Crazy Eights' },
  { slug: 'ludo', label: 'Ludo' },
  { slug: 'ayo', label: 'Ayo (Mancala)' },
  { slug: 'yahtzee', label: 'Five Dice (Yahtzee)' },
] as const

/**
 * Fire-and-forget log of a solo game start, for admin adoption stats.
 *
 * Solo games are entirely client-side (no games row), so this POST is the only
 * signal we get. Called once per fresh init / restart from each solo client —
 * not on rehydrate, so a mid-game reload doesn't double-count. Errors are
 * swallowed: a missing analytics row must never break the practice mode.
 */
export function logSoloPlayStarted(gameType: GameType, difficulty?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    void fetch('/api/solo-plays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameType, difficulty: difficulty ?? null }),
      keepalive: true,
    }).catch(() => {
      /* noop */
    })
  } catch {
    /* noop */
  }
}

const SOLO_SESSION_STORAGE_PREFIX = 'solo-session-id:'

/**
 * Session-scoped id for one solo game, minted on first ask and cleared when the client
 * starts a fresh game. Two purposes:
 *
 * 1. Idempotency for the finish POST. `awarded_sessions(profile_id, session_id)` is the
 *    lock the multiplayer award pass uses; solo reuses the same PK with a `solo:` prefix
 *    so a retried finish (network blip → replay) collapses to one award instead of two.
 *
 * 2. Rehydrate-safe. A tab-reload mid-game restores state from sessionStorage; asking for
 *    the id here returns the SAME id, so the finish that eventually fires still lines up
 *    with the game the user actually played.
 *
 * A crypto-strong id is preferred where available — falls back to a timestamp-plus-random
 * string that is still unique enough to key `awarded_sessions` on.
 */
export function soloSessionId(gameType: GameType): string {
  if (typeof window === 'undefined') return `solo-ssr-${gameType}`
  const key = `${SOLO_SESSION_STORAGE_PREFIX}${gameType}`
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const fresh =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(key, fresh)
    return fresh
  } catch {
    return `solo-fallback-${gameType}-${Date.now()}`
  }
}

/** Drop the current solo session id so the next call to `soloSessionId` mints a new one. */
export function resetSoloSessionId(gameType: GameType): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(`${SOLO_SESSION_STORAGE_PREFIX}${gameType}`)
  } catch {
    /* noop */
  }
}

export type SoloFinishOutcome = 'human' | 'bot' | 'draw'

export interface SoloFinishPayload {
  gameType: GameType
  outcome: SoloFinishOutcome
  difficulty?: string | null
  /** Elapsed play time in ms — used by streak/late-night counters if the server wants it. */
  durationMs?: number | null
  /**
   * Session id that identifies this specific solo game. Get it from `soloSessionId`. The
   * server keys idempotency on `(profile_id, solo:<sessionId>)` so a retried finish only
   * counts once.
   */
  sessionId: string
}

/**
 * Persist a finished solo game to the signed-in profile.
 *
 * Fire-and-forget: this runs behind the same finish handler that already updated the
 * local scoreboard, and its result must never bounce back into game state. Silent
 * no-op for guests (server 401s) — their local scoreboard is still authoritative.
 */
export function logSoloPlayFinished(payload: SoloFinishPayload): void {
  if (typeof window === 'undefined') return
  try {
    void fetch('/api/solo-plays/finish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* noop */
    })
  } catch {
    /* noop */
  }
}
