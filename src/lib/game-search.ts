import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'

/**
 * Alt names people search for that don't appear in a game's own label/tagline/copy —
 * e.g. "draughts" is the common name for Checkers outside the US.
 */
const SEARCH_ALIASES: Partial<Record<GameType, string[]>> = {
  checkers: ['draughts'],
  checkers_international: ['international draughts', 'flying kings', 'polish draughts', 'fmjd'],
  checkers_nigeria: ['nigerian draughts', 'naija checkers', 'draughts nigeria', 'seed draughts'],
}

/**
 * Shared free-text matcher for every game picker (the create-screen modal, the marketing
 * modal and the public /games grid). These each grew their own predicate over different
 * subsets of fields, so a search that worked in one place quietly missed results in another.
 *
 * `extra` lets a caller fold in fields it has but the registry doesn't — the /games grid
 * passes its landing-page hero copy, for example.
 */
export function matchesGameSearch(gameType: GameType, query: string, extra: string[] = []): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const cfg = gameTypeConfig(gameType)
  const haystack = [
    cfg.label,
    cfg.tagline,
    cfg.card.vibe,
    cfg.card.players,
    // "never_have_i_ever" should match a search for "never have i ever".
    gameType.replace(/_/g, ' '),
    ...(SEARCH_ALIASES[gameType] ?? []),
    ...extra,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}
