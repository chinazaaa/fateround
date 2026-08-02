import type { CatalogTrophy } from './catalog'

/**
 * SYSTEM trophies — authored in code, against one game's own measurements.
 *
 * The generic catalog (`./catalog.ts`) builds the same eight templates for every game out of
 * counters every game emits. This file is the opposite: trophies that only mean anything for one
 * game, written against the counters that game's facts builder emits
 * (`./game-facts/<game>.ts`).
 *
 * WHY THEY ARE CODE AND NOT ADMIN ROWS. The rule and the builder are one unit. A rule naming
 * `trivia_streak_10_games` is only satisfiable because `triviaFacts` emits that key; edit either
 * half alone and the trophy reads as zero forever, with no error anywhere. Keeping both in code,
 * reviewed together, is what stops that. Admin still SEES them — they seed into the same table,
 * flagged `is_system`, so `/admin/trophies` shows the true full catalog — but they are read-only
 * there.
 *
 * ADDING A GAME: write its facts builder, register its counters in `./counters.ts`, then add its
 * trophies here. Re-seeding from admin picks up anything new; nothing is ever silently changed
 * under an existing row, because ids are permanent once earned.
 *
 * IDS ARE FOREVER. `player_trophies.trophy_id` is ON DELETE RESTRICT, so an id that anyone has
 * earned cannot be renamed or removed — only retired. Choose them carefully.
 */

/** A counter rule scoped to one game. The only shape these need. */
function rule(counter: string, gte: number, gameType: string) {
  return { type: 'counter' as const, counter, gte, gameType }
}

type SystemTrophySpec = {
  suffix: string
  tier: CatalogTrophy['tier']
  title: string
  description: string
  counter: string
  gte?: number
  points: number
  sortOrder: number
  hidden?: boolean
}

/**
 * Trivia — derived entirely from `trivia_answers` at finish. See `./game-facts/trivia.ts`.
 *
 * Ordered bronze → platinum, and the thresholds are the brief's. Where the brief asked for
 * something the data cannot support it is simply absent rather than approximated: "Host 5 games"
 * and "Host 25 games" are not here, because a host who does not play has no player row the award
 * pass will accept, so the trophy could never fire.
 */
const TRIVIA: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_correct',
    tier: 'bronze',
    title: 'First answer',
    description: 'Answer a Trivia question correctly.',
    counter: 'trivia_correct_answers',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'quick_draw',
    tier: 'bronze',
    title: 'Quick draw',
    description: 'Be the first to answer a question correctly.',
    counter: 'trivia_first_correct_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'hat_trick',
    tier: 'bronze',
    title: 'Hat trick',
    description: 'Get three questions right in a row.',
    counter: 'trivia_streak_3_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'buzzer_beater',
    tier: 'bronze',
    title: 'Buzzer beater',
    description: 'Answer correctly with under two seconds left.',
    counter: 'trivia_buzzer_beater_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'custom_crowd',
    tier: 'bronze',
    title: 'Custom crowd',
    description: 'Play a game using an uploaded question set.',
    counter: 'trivia_custom_set_games',
    points: 10,
    sortOrder: 50,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'five_alive',
    tier: 'silver',
    title: 'Five alive',
    description: 'Get five questions right in a row.',
    counter: 'trivia_streak_5_games',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'speed_demon',
    tier: 'silver',
    title: 'Speed demon',
    description: 'Be first to answer correctly five times in one game.',
    counter: 'trivia_speed_demon_games',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'full_marks',
    tier: 'silver',
    title: 'Full marks',
    description: 'Answer every question correctly in a five-question game.',
    counter: 'trivia_full_marks_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'big_room',
    tier: 'silver',
    title: 'Big room',
    description: 'Play a game with fifteen or more players.',
    counter: 'trivia_big_room_15',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'century',
    tier: 'silver',
    title: 'Century',
    description: 'Answer 100 questions correctly.',
    counter: 'trivia_correct_answers',
    gte: 100,
    points: 40,
    sortOrder: 100,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win from outside the top three at the halfway point.',
    counter: 'trivia_comeback_wins',
    points: 35,
    sortOrder: 110,
  },
  {
    suffix: 'lightning',
    tier: 'silver',
    title: 'Lightning',
    description: 'Average under three seconds per correct answer in a game.',
    counter: 'trivia_lightning_games',
    points: 35,
    sortOrder: 120,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'perfect_game',
    tier: 'gold',
    title: 'Perfect game',
    description: 'Answer every question correctly in a game of ten or more.',
    counter: 'trivia_perfect_10q_games',
    points: 60,
    sortOrder: 130,
  },
  {
    suffix: 'ten_streak',
    tier: 'gold',
    title: 'Ten streak',
    description: 'Get ten questions right in a row.',
    counter: 'trivia_streak_10_games',
    points: 60,
    sortOrder: 140,
  },
  {
    suffix: 'wire_to_wire',
    tier: 'gold',
    title: 'Untouchable',
    description: 'Win a game having led after every single question.',
    counter: 'trivia_wire_to_wire_wins',
    points: 70,
    sortOrder: 150,
  },
  {
    suffix: 'packed_house',
    tier: 'gold',
    title: 'Packed house',
    description: 'Win a game with twenty or more players.',
    counter: 'trivia_packed_house_wins',
    points: 70,
    sortOrder: 160,
  },
  {
    suffix: 'half_millennium',
    tier: 'gold',
    title: 'Half millennium',
    description: 'Answer 500 questions correctly.',
    counter: 'trivia_correct_answers',
    gte: 500,
    points: 80,
    sortOrder: 170,
  },
  {
    suffix: 'clean_sweep',
    tier: 'gold',
    title: 'Clean sweep',
    description: 'Be first to answer correctly on every question in a game.',
    counter: 'trivia_clean_sweep_games',
    points: 80,
    sortOrder: 180,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless_victory',
    tier: 'platinum',
    title: 'Flawless victory',
    description: 'Win with perfect accuracy in a game of fifteen or more questions.',
    counter: 'trivia_flawless_wins',
    points: 150,
    sortOrder: 190,
  },
  {
    suffix: 'twenty_streak',
    tier: 'platinum',
    title: 'Twenty streak',
    description: 'Get twenty questions right in a row.',
    counter: 'trivia_streak_20_games',
    points: 150,
    sortOrder: 200,
    hidden: true,
  },
]

const BY_GAME: Record<string, SystemTrophySpec[]> = {
  trivia: TRIVIA,
}

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
      criteria: rule(s.counter, s.gte ?? 1, gameType),
      points: s.points,
      hidden: s.hidden ?? false,
      sort_order: s.sortOrder,
    }))
  )
}
