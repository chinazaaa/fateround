/**
 * Solo-play helpers (mobile).
 *
 * Mirrors the web helpers in `src/lib/solo-play.ts` so the same taxonomy of
 * "which games have a /play-solo/* screen" lives on both platforms, and the
 * same `/api/solo-plays` analytics POST fires on fresh init.
 *
 * The route slug matches the file under `apps/mobile/app/play-solo/`, so a
 * screen navigates via `router.push(\`/play-solo/\${soloPlaySlug('whot')}\`)`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { GameType } from '@fateround/shared'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'

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
 * Fire-and-forget analytics: log that a fresh solo game was started. Called
 * once per init/restart from each mobile solo screen — never on rehydrate,
 * so a mid-game app-restart doesn't inflate the tally. Errors are swallowed:
 * a missing analytics row must never break the practice mode.
 */
export function logSoloPlayStarted(gameType: GameType, difficulty?: string | null): void {
  try {
    void fetch(apiUrl('/api/solo-plays'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameType, difficulty: difficulty ?? null }),
    }).catch(() => {
      /* noop */
    })
  } catch {
    /* noop */
  }
}

const SOLO_SESSION_STORAGE_PREFIX = 'solo-session-id:'

/**
 * Session-scoped id for one solo game, minted on first ask and cleared when the screen
 * starts a fresh game. Backs `awarded_sessions(profile_id, session_id)` on the server so a
 * retried finish only counts once. Persisted in AsyncStorage so an app-restart mid-game
 * still finishes against the SAME session the user was playing.
 */
export async function soloSessionId(gameType: GameType): Promise<string> {
  const key = `${SOLO_SESSION_STORAGE_PREFIX}${gameType}`
  try {
    const existing = await AsyncStorage.getItem(key)
    if (existing) return existing
    const fresh = randomSessionId()
    await AsyncStorage.setItem(key, fresh)
    return fresh
  } catch {
    return `solo-fallback-${gameType}-${Date.now()}`
  }
}

/** Drop the current solo session id so the next call to `soloSessionId` mints a new one. */
export async function resetSoloSessionId(gameType: GameType): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${SOLO_SESSION_STORAGE_PREFIX}${gameType}`)
  } catch {
    /* noop */
  }
}

function randomSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type SoloFinishOutcome = 'human' | 'bot' | 'draw'

export interface SoloFinishPayload {
  gameType: GameType
  outcome: SoloFinishOutcome
  difficulty?: string | null
  durationMs?: number | null
  sessionId: string
}

/**
 * Persist a finished solo game to the signed-in profile. Fire-and-forget; a guest gets a
 * 401 and their local scoreboard remains authoritative.
 */
export async function logSoloPlayFinished(payload: SoloFinishPayload): Promise<void> {
  try {
    const headers = (await authHeaders()) ?? { 'Content-Type': 'application/json' }
    await fetch(apiUrl('/api/solo-plays/finish'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch {
    /* noop */
  }
}
