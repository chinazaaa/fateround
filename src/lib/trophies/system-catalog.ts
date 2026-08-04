import type { CatalogTrophy } from './catalog'
import { AYO } from './system-trophies/ayo'
import { CHECKERS, CHECKERS_INTERNATIONAL, CHECKERS_NIGERIA } from './system-trophies/checkers'
import { CHESS } from './system-trophies/chess'
import { CRAZY_EIGHTS } from './system-trophies/crazy-eights'
import { DESCRIBE_IT } from './system-trophies/describe-it'
import { MAFIA } from './system-trophies/mafia'
import { MAHJONG } from './system-trophies/mahjong'
import { SCRABBLE } from './system-trophies/scrabble'
import { CODEWORDS } from './system-trophies/codewords'
import { LUDO } from './system-trophies/ludo'
import { MONOPOLY } from './system-trophies/monopoly'
import { TRIVIA } from './system-trophies/trivia'
import type { SystemTrophySpec } from './system-trophies/types'
import { UNO } from './system-trophies/uno'
import { WHOT } from './system-trophies/whot'
import { YAHTZEE } from './system-trophies/yahtzee'

/**
 * SYSTEM trophies — authored in code, against one game's own measurements.
 *
 * The generic catalog (`./catalog.ts`) builds the same eight templates for every game out of
 * counters every game emits. These are the opposite: trophies that only mean anything for one
 * game, written against the counters that game's facts builder emits (`./game-facts/<game>.ts`).
 *
 * WHY THEY ARE CODE AND NOT ADMIN ROWS. The rule and the builder are one unit. A rule naming
 * `trivia_streak_10_games` is only satisfiable because `triviaFacts` emits that key; edit either
 * half alone and the trophy reads as zero forever, with no error anywhere. Keeping both in code,
 * reviewed together, is what stops that. Admin still SEES them — they seed into the same table,
 * flagged `is_system`, so `/admin/trophies` shows the true full catalog — but they are read-only
 * there.
 *
 * ADDING A GAME: write its facts builder, register its counters in `./counters.ts`, add a file
 * under `./system-trophies/`, and list it below. Re-seeding from admin picks up anything new;
 * nothing is ever silently changed under an existing row, because ids are permanent once earned.
 *
 * IDS ARE FOREVER. `player_trophies.trophy_id` is ON DELETE RESTRICT, so an id that anyone has
 * earned cannot be renamed or removed — only retired. Choose them carefully.
 */

/** A counter rule scoped to one game. The shape almost every system trophy needs. */
function rule(counter: string, gte: number, gameType: string) {
  return { type: 'counter' as const, counter, gte, gameType }
}

const BY_GAME: Record<string, SystemTrophySpec[]> = {
  ayo: AYO,
  checkers: CHECKERS,
  checkers_international: CHECKERS_INTERNATIONAL,
  checkers_nigeria: CHECKERS_NIGERIA,
  chess: CHESS,
  codewords: CODEWORDS,
  crazy_eights: CRAZY_EIGHTS,
  describe_it: DESCRIBE_IT,
  ludo: LUDO,
  mafia: MAFIA,
  mahjong: MAHJONG,
  monopoly: MONOPOLY,
  scrabble: SCRABBLE,
  trivia: TRIVIA,
  uno: UNO,
  whot: WHOT,
  yahtzee: YAHTZEE,
}

/**
 * Ids that may be unlocked mid-round.
 *
 * `unlockNow` refuses anything absent from this set. Derived from the specs rather than kept as
 * its own list, so eligibility can never drift from the trophy it describes.
 */
export const INSTANT_TROPHY_IDS: ReadonlySet<string> = new Set(
  Object.entries(BY_GAME).flatMap(([gameType, specs]) =>
    specs.filter((s) => s.instant).map((s) => `${gameType}.sys.${s.suffix}`)
  )
)

/** Game types that have a system trophy set, for the admin UI. */
export function gamesWithSystemTrophies(): string[] {
  return Object.keys(BY_GAME).sort()
}

/**
 * The full system catalog, ready to seed.
 *
 * Ids are `<game>.sys.<suffix>` — the `sys` segment keeps them from ever colliding with the
 * generic catalog's `<game>.<suffix>`, which matters because both seed into one table and an id
 * collision would silently overwrite one with the other.
 */
export function buildSystemCatalog(): CatalogTrophy[] {
  return Object.entries(BY_GAME).flatMap(([gameType, specs]) =>
    specs.map((s) => ({
      id: `${gameType}.sys.${s.suffix}`,
      game_type: gameType,
      tier: s.tier,
      title: s.title,
      description: s.description,
      // A composite spec owns its whole rule (and the gameType on every node); a plain one is
      // auto-scoped to the game it is filed under. Exactly one of `criteria`/`counter` is set.
      criteria: s.criteria ?? rule(s.counter as string, s.gte ?? 1, gameType),
      points: s.points,
      hidden: s.hidden ?? false,
      sort_order: s.sortOrder,
    }))
  )
}
