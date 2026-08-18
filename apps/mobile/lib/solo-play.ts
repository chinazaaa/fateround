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

import type { GameType } from '@fateround/shared'
import { apiUrl } from '@/lib/config'

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
