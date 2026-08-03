import type { SystemTrophySpec } from './types'

/**
 * Ludo — folded at finish from the in-play accumulator. See `./game-facts/ludo.ts`.
 *
 * Ordered bronze → platinum. Every counter named below is emitted by `ludoFacts`; the thresholds
 * are the brief's. Where the brief asked for something the engine cannot honour, the item is
 * dropped or reworded here rather than approximated — an unearnable trophy is indistinguishable
 * from a typo. From the 30-trophy Ludo brief:
 *
 * OMITTED — already built generically for every game, so a second copy would be the same trophy:
 *  - #1 "Out of the Yard" (first piece out) ≈ the generic first-play / games_played track.
 *  - #30 "Ludo Champion" (win 5/15/30/50) IS the generic `games_won` Champion track.
 *
 * DROPPED — the condition is not something the Ludo engine can express (verified in src/lib/ludo.ts):
 *  - #8 "Long Haul" (move a piece 50+ squares) duplicates #5 "Homeward": the path is a fixed 57
 *    steps, so any piece that reaches home has travelled ~56 — the two fire on the same event.
 *  - #13 "Exact Change" and #22 "Photo Finish" (enter home on an exact roll) are ALWAYS TRUE: a
 *    roll that would overshoot the home mouth is rejected (HOME_ENTRY_STEPS / `newSteps > FINISH_STEPS`
 *    is illegal), so every home entry is already exact. Nothing distinguishes the achievement.
 *  - #15 "Roadblock" (hold a blockade for 3 turns) — there is no blockade mechanic to hold (see #9),
 *    and cross-turn duration is not tracked; unmeasurable.
 *  - #28 "Home Run" (all four home, none captured) duplicates #19 "Untouchable": winning IS getting
 *    all four home, so "win with none captured" and "all four home with none captured" are one rule.
 *
 * REWORDED — the brief assumed a mechanic Ludo does not have, so the copy is corrected to what the
 * engine actually does:
 *  - #9 "Blockade" → "Shield". Ludo has no path-blocking; two of your pieces on one square only makes
 *    the pair capture-proof (`count === 1` gates a capture). The trophy rewards forming that pair.
 *  - #10 "Double Capture" is scoped to a single MOVE — the atomic unit the engine can see — which is
 *    reachable when one landing square holds a lone piece from two different opponents.
 *  - #24 "Gridlock" — the forfeit is three double SIXES in a row (only a double six grants the bonus
 *    roll, `ludoGrantsExtraRoll`), not "three doubles"; copy corrected.
 *
 * VARIANT NOTE. #3 "Safe House" only fires in the `modern` variant — `traditional` has an empty
 * safe-square set, so there is nowhere safe to land. The description says so.
 *
 * PLAYER MINIMUMS. Win- and capture-gated trophies name their thresholds in the description; the
 * counters behind them apply the seat gate (see `ludoFacts`) so an empty two-alt room can't farm them.
 *
 * NOTHING HERE IS `instant`. First Blood, Lucky Six and Double Six are each decidable at a single
 * action the engine already computes, so they are instant-ELIGIBLE, but wiring a mid-round pop needs
 * an `unlockNow` call in the roll/move route, which is out of scope for this change. They award at
 * finish through the counters like everything else until that wiring lands.
 */
export const LUDO: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'lucky_six',
    tier: 'bronze',
    title: 'Lucky six',
    description: 'Roll a six.',
    counter: 'ludo_sixes_rolled',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'first_blood',
    tier: 'bronze',
    title: 'First blood',
    description: "Capture an opponent's piece.",
    counter: 'ludo_captures_made',
    points: 15,
    sortOrder: 20,
  },
  {
    suffix: 'safe_house',
    tier: 'bronze',
    title: 'Safe house',
    description: 'Land a piece on a safe square (modern variant).',
    counter: 'ludo_safe_landings',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'homeward',
    tier: 'bronze',
    title: 'Homeward',
    description: 'Get one piece all the way home.',
    counter: 'ludo_pieces_home_1',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'double_six',
    tier: 'bronze',
    title: 'Double six',
    description: 'Roll a double six.',
    counter: 'ludo_double_sixes',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'full_deployment',
    tier: 'bronze',
    title: 'Full deployment',
    description: 'Have all four of your pieces out of the yard at once.',
    counter: 'ludo_full_deploy_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'shield',
    tier: 'silver',
    title: 'Shield',
    description: 'Stack two of your own pieces on one square, safe from capture.',
    counter: 'ludo_shield_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'six_sense',
    tier: 'silver',
    title: 'Six sense',
    description: 'Roll three sixes in one game.',
    counter: 'ludo_six_sense_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'halfway_house',
    tier: 'silver',
    title: 'Halfway house',
    description: 'Get two pieces home.',
    counter: 'ludo_pieces_home_2',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'fast_start',
    tier: 'silver',
    title: 'Fast start',
    description: 'Bring a piece out on your very first roll.',
    counter: 'ludo_fast_start_games',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'double_capture',
    tier: 'silver',
    title: 'Double capture',
    description: 'Capture two opponent pieces with a single move.',
    counter: 'ludo_double_capture_games',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'sent_packing',
    tier: 'silver',
    title: 'Sent packing',
    description: 'Capture the same opponent three times in one game.',
    counter: 'ludo_sent_packing_games',
    points: 30,
    sortOrder: 120,
  },
  {
    suffix: 'escape_artist',
    tier: 'silver',
    title: 'Escape artist',
    description: 'Get a piece captured and still bring it all the way home.',
    counter: 'ludo_escape_artist_games',
    points: 30,
    sortOrder: 130,
  },
  {
    suffix: 'three_home',
    tier: 'silver',
    title: 'Three home',
    description: 'Get three pieces home.',
    counter: 'ludo_pieces_home_3',
    points: 30,
    sortOrder: 140,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'dice_hot',
    tier: 'gold',
    title: 'Dice hot',
    description: 'Roll five sixes in one game.',
    counter: 'ludo_dice_hot_games',
    points: 60,
    sortOrder: 150,
  },
  {
    suffix: 'gridlock',
    tier: 'gold',
    title: 'Gridlock',
    description: 'Roll three double sixes in a row and forfeit the turn.',
    counter: 'ludo_gridlock_games',
    points: 60,
    sortOrder: 160,
  },
  {
    suffix: 'clean_sweep',
    tier: 'gold',
    title: 'Clean sweep',
    description: 'Capture five or more opponent pieces in one game (three or more players).',
    counter: 'ludo_clean_sweep_games',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'four_corners',
    tier: 'gold',
    title: 'Four corners',
    description: 'Win a four-player game.',
    counter: 'ludo_four_corners_wins',
    points: 70,
    sortOrder: 180,
  },
  {
    suffix: 'comeback',
    tier: 'gold',
    title: 'Comeback',
    description: 'Win after having all four of your pieces knocked back to the yard at once.',
    counter: 'ludo_comeback_wins',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'untouchable',
    tier: 'gold',
    title: 'Untouchable',
    description: 'Win a game without losing a single piece to capture.',
    counter: 'ludo_untouched_wins',
    points: 80,
    sortOrder: 200,
  },
  {
    suffix: 'runaway',
    tier: 'gold',
    title: 'Runaway',
    description: 'Win before any opponent gets a second piece home.',
    counter: 'ludo_runaway_games',
    points: 80,
    sortOrder: 210,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'perfect_run',
    tier: 'platinum',
    title: 'Perfect run',
    description: 'Win a four-player game without a single one of your pieces being captured.',
    counter: 'ludo_perfect_run_wins',
    points: 150,
    sortOrder: 220,
  },
  {
    suffix: 'untouched_sweep',
    tier: 'platinum',
    title: 'Untouched sweep',
    description: 'Win having captured five or more pieces and lost none (three or more players).',
    counter: 'ludo_untouched_sweep_wins',
    points: 150,
    sortOrder: 230,
    hidden: true,
  },
]
