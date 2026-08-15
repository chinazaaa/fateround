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
}

export function soloPlaySlug(gameType: GameType): string | null {
  return SOLO_PLAY_SLUGS[gameType] ?? null
}

export function hasSoloPlay(gameType: GameType): boolean {
  return soloPlaySlug(gameType) != null
}
