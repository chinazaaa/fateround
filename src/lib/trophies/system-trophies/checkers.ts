import { allOf, counterCrit, type SystemTrophySpec } from './types'

// Win in every board variant. The three are SEPARATE game types, so this is a conjunction over
// `games_won` in each — the one counter the award pass writes into every game's own scope. It
// lives in the shared base so it shows (and can be earned toward) on all three boards.
const CROSS_VARIANT_CHAMPION: SystemTrophySpec = {
  suffix: 'grandmaster',
  tier: 'platinum',
  title: 'Draughts Grandmaster',
  description: 'Win a game on all three boards: American 8x8, International 10x10 and Nigerian.',
  criteria: allOf(
    counterCrit('games_won', 1, 'checkers'),
    counterCrit('games_won', 1, 'checkers_international'),
    counterCrit('games_won', 1, 'checkers_nigeria')
  ),
  points: 250,
  sortOrder: 300,
  hidden: true,
}

/**
 * Checkers / Draughts — folded at finish from the in-play accumulator. See
 * `./game-facts/checkers.ts`. ONE facts builder serves all three game types; the trophies
 * are split into per-variant lists so a trophy only ever seeds onto a board that can EARN it
 * (an unearnable trophy is indistinguishable from a typo):
 *
 *  - CHECKERS               (American 8x8): the shared base only.
 *  - CHECKERS_INTERNATIONAL (10x10):        base + the flying-king / majority-capture pair.
 *  - CHECKERS_NIGERIA       (10x10 Naija):  base + those + the seeds / Street-Rules pair.
 *
 * Ids are `<gameType>.sys.<suffix>`, so a shared suffix produces three DISTINCT ids across
 * the variants (each is its own game with its own record) — intended, not a collision.
 *
 * VARIANT NOTE. Flying King and Majority Rule are both driven by the 10x10 engine
 * (src/lib/draughts10.ts), which Nigeria shares — the audit's "International" label is
 * presentational, so both fire on either 10x10 board and live in the shared 10x10 extra.
 * Seeds and Street Rules are genuinely Nigeria-only: "seeds" is the correct Nigerian-draughts
 * term for pieces (not an Ayo borrowing), and `huffing_enabled` is forced false off the
 * Nigerian board, so those two sit in the Nigeria-only extra.
 *
 * OMITTED — already built generically for every game, so a second copy would be the same trophy:
 *  - "First move" ≈ the generic first-play / games_played track.
 *  - A plain "Winner" ≈ the generic `games_won` Champion track. Only SPECIFIC wins are kept
 *    below (by blockade, by capturing all, on the clock, untouched, …).
 *
 * CROSS-VARIANT NOTE (reported, not built here). A single "Checkers Champion — win across all
 * three variants" track cannot be expressed: the counter DSL sums one counter within one game
 * type, and `games_won` is per-type. Summing wins across `checkers` + `checkers_international`
 * + `checkers_nigeria` needs a shared cross-variant counter the engine does not emit, so the
 * track is omitted until that counter exists.
 *
 * Majority Rule is deliberately pitched ABOVE Quadruple Jump (a five-piece forced sequence vs
 * a four-hop chain) so the two are not the same event with two names.
 *
 * NOTHING HERE IS `instant` — every flag is settled at finish through the counters. Some (First
 * Jump, Crowned) are decidable at a single action and so instant-ELIGIBLE, but wiring a
 * mid-round pop needs an `unlockNow` call in the move route, which is out of scope here.
 */

// ── Shared base (all three variants) ────────────────────────────────────────────────────────
const CHECKERS_BASE: SystemTrophySpec[] = [
  // Bronze
  {
    suffix: 'first_jump',
    tier: 'bronze',
    title: 'First jump',
    description: "Capture an opponent's piece.",
    counter: 'checkers_captures',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'crowned',
    tier: 'bronze',
    title: 'Crowned',
    description: 'Crown one of your men into a king.',
    counter: 'checkers_kings_made',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'double_jump',
    tier: 'bronze',
    title: 'Double jump',
    description: 'Capture two pieces in a single turn.',
    counter: 'checkers_double_jump_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'hard_fought',
    tier: 'bronze',
    title: 'Hard fought',
    description: 'Play a game all the way to a draw.',
    counter: 'checkers_draw_games',
    points: 10,
    sortOrder: 40,
  },

  // Silver
  {
    suffix: 'five_down',
    tier: 'silver',
    title: 'Five down',
    description: 'Capture five or more pieces in one game.',
    counter: 'checkers_five_down_games',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'triple_jump',
    tier: 'silver',
    title: 'Triple jump',
    description: 'Capture three pieces in a single turn.',
    counter: 'checkers_triple_jump_games',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'king_me_twice',
    tier: 'silver',
    title: 'King me twice',
    description: 'Hold two kings on the board at once.',
    counter: 'checkers_king_me_twice_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'fair_trade',
    tier: 'silver',
    title: 'Fair trade',
    description: 'Capture on the turn straight after the opponent captured one of yours.',
    counter: 'checkers_trade_games',
    points: 20,
    sortOrder: 80,
  },
  {
    suffix: 'king_hunter',
    tier: 'silver',
    title: 'King hunter',
    description: "Capture one of the opponent's kings.",
    counter: 'checkers_enemy_kings_captured',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'blitz',
    tier: 'silver',
    title: 'Blitz win',
    description: 'Win a three-minute game.',
    counter: 'checkers_blitz_wins',
    points: 30,
    sortOrder: 100,
  },

  // Gold
  {
    suffix: 'quad_jump',
    tier: 'gold',
    title: 'Quadruple jump',
    description: 'Capture four pieces in a single turn.',
    counter: 'checkers_quad_jump_games',
    points: 60,
    sortOrder: 110,
  },
  {
    suffix: 'kings_court',
    tier: 'gold',
    title: "King's court",
    description: 'Hold three kings on the board at once.',
    counter: 'checkers_kings_court_games',
    points: 60,
    sortOrder: 120,
  },
  {
    suffix: 'home_guard',
    tier: 'gold',
    title: 'Home guard',
    description: 'Keep a piece on your back row for fifteen of your turns in a row.',
    counter: 'checkers_back_row_games',
    points: 60,
    sortOrder: 130,
  },
  {
    suffix: 'blockade',
    tier: 'gold',
    title: 'Blockade',
    description: 'Win by leaving the opponent with no legal move.',
    counter: 'checkers_blockade_wins',
    points: 70,
    sortOrder: 140,
  },
  {
    suffix: 'total_victory',
    tier: 'gold',
    title: 'Total victory',
    description: 'Win by capturing every last one of their pieces.',
    counter: 'checkers_total_victory_wins',
    points: 70,
    sortOrder: 150,
  },
  {
    suffix: 'clock_watcher',
    tier: 'gold',
    title: 'Clock watcher',
    description: 'Win a timed game with under fifteen seconds left on your clock.',
    counter: 'checkers_clock_watcher_wins',
    points: 70,
    sortOrder: 160,
  },
  {
    suffix: 'comeback',
    tier: 'gold',
    title: 'Comeback',
    description: 'Win after being four or more pieces down.',
    counter: 'checkers_comeback_wins',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'quick_win',
    tier: 'gold',
    title: 'Quick win',
    description: 'Win in a dozen turns or fewer.',
    counter: 'checkers_quick_win_wins',
    points: 60,
    sortOrder: 180,
  },
  {
    suffix: 'endgame_master',
    tier: 'gold',
    title: 'Endgame master',
    description: 'Win a game that ground down to an endgame.',
    counter: 'checkers_endgame_master_wins',
    points: 60,
    sortOrder: 190,
  },

  // Platinum
  {
    suffix: 'untouched',
    tier: 'platinum',
    title: 'Untouched',
    description: 'Win without losing a single piece.',
    counter: 'checkers_untouched_wins',
    points: 150,
    sortOrder: 200,
    hidden: true,
  },
  CROSS_VARIANT_CHAMPION,
]

// ── 10x10 extra (International AND Nigeria — same draughts10 engine) ─────────────────────────
const CHECKERS_10_EXTRA: SystemTrophySpec[] = [
  {
    suffix: 'flying_king',
    tier: 'silver',
    title: 'Flying king',
    description: 'Sweep a king four squares or more in a single hop.',
    counter: 'checkers_flying_king_games',
    points: 30,
    sortOrder: 105,
  },
  {
    suffix: 'majority_rule',
    tier: 'platinum',
    title: 'Majority rule',
    description: 'Take a forced majority capture of five pieces in one sequence.',
    counter: 'checkers_majority_rule_games',
    points: 150,
    sortOrder: 205,
    hidden: true,
  },
]

// ── Nigeria-only extra (seeds terminology + Street Rules huffing) ────────────────────────────
const CHECKERS_NIGERIA_EXTRA: SystemTrophySpec[] = [
  {
    suffix: 'seed_master',
    tier: 'gold',
    title: 'Seed master',
    description: 'Capture fifteen seeds in one game.',
    counter: 'checkers_seed_master_games',
    points: 70,
    sortOrder: 155,
  },
  {
    suffix: 'street_rules',
    tier: 'silver',
    title: 'Street rules',
    description: 'Win a game played under Street Rules (huffing enabled).',
    counter: 'checkers_street_rules_wins',
    points: 30,
    sortOrder: 106,
  },
]

/** American 8x8 — shared base only. */
export const CHECKERS: SystemTrophySpec[] = CHECKERS_BASE

/** International 10x10 — base plus the flying-king / majority-capture pair. */
export const CHECKERS_INTERNATIONAL: SystemTrophySpec[] = [...CHECKERS_BASE, ...CHECKERS_10_EXTRA]

/** Nigerian 10x10 — base, the 10x10 pair, plus seeds and Street Rules. */
export const CHECKERS_NIGERIA: SystemTrophySpec[] = [...CHECKERS_BASE, ...CHECKERS_10_EXTRA, ...CHECKERS_NIGERIA_EXTRA]
