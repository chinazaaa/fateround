import type { SystemTrophySpec } from './types'

/**
 * Crazy Eights — derived at finish from the per-game accumulator the engine folds forward on every
 * turn. See `./game-facts/crazy-eights.ts` for how each counter is produced, and
 * `src/lib/crazy-eights.ts` for the in-play folding.
 *
 * Ordered bronze → platinum, thresholds from the brief. Six of the brief's thirty are absent:
 *
 *  - "First Deal" (finish a game) and the "Crazy Eights Champion" win track are `games_played` /
 *    `games_won` rules the generic catalog already builds for every game; duplicating them would
 *    seed two trophies for one achievement.
 *  - "Face Value" (win holding no face cards) and "Low Score" (win holding ≤5 points) are vacuous
 *    the normal way a hand is won: the winner emptied their hand, so it holds nothing — no face
 *    cards and zero points, always. They would fire on essentially every win, so they are dropped
 *    rather than reworded into something the brief did not ask for.
 *  - "Heavy Hand" (make opponents draw 10+ cards) cannot be counted: the cards are drawn in the
 *    VICTIM's turn handler, in the victim's own row, with no atomic link back to whoever set the
 *    penalty (and a penalty may be stacked or defended before it lands). Attributing it to the
 *    setter would need a second, non-atomic cross-player write that could double-count, so it is
 *    left out — see the report accompanying this change.
 *  - "Clean Sweep" (win three games in a row) is a cross-GAME streak, not a per-game fact. Counters
 *    are lifetime SUMS, so a run of consecutive wins is not expressible as one summable integer and
 *    there is no win-streak counter to hang it on.
 *
 * Two trophies are worded to match the engine, and one is gated by table size:
 *  - "Jump the queue" counts a Jack OR an Ace, because both are Skips in this engine (rank 1 and 11).
 *  - "Untouched" and "Flawless" require three or more seated players, per the brief's footnote, so
 *    they cannot be farmed heads-up where penalties barely bite.
 *
 * NOTE (integration): a Crazy Eights winner empties their hand and the engine flips them
 * `spectator = true`. The award pass and the finish-time facts snapshot both currently drop
 * spectators, so the win-gated counters below (and even generic `games_won`) will not reach the
 * emptied-hand winner until that exclusion is addressed. Flagged in the report; the counters here
 * are correct and fire the moment it is.
 */
export const CRAZY_EIGHTS: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'crazy_eight',
    tier: 'bronze',
    title: 'Crazy Eight',
    description: 'Play an 8 and name a suit.',
    counter: 'c8_eights_played',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'pick_two',
    tier: 'bronze',
    title: 'Pick Two',
    description: 'Play a 2 and make the next player draw.',
    counter: 'c8_pick_twos_played',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'jump_queue',
    tier: 'bronze',
    title: 'Jump the queue',
    description: 'Play a Jack or an Ace to skip the next player.',
    counter: 'c8_skips_played',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'reversal',
    tier: 'bronze',
    title: 'Reversal',
    description: 'Play a Queen to reverse the direction of play.',
    counter: 'c8_reverses_played',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'suit_yourself',
    tier: 'bronze',
    title: 'Suit yourself',
    description: 'Change the suit three times in one game.',
    counter: 'c8_suit_changes_3_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'to_the_pile',
    tier: 'bronze',
    title: 'To the pile',
    description: 'Draw five cards in a single game.',
    counter: 'c8_drew_5_games',
    points: 10,
    sortOrder: 60,
  },
  {
    suffix: 'jokers_wild',
    tier: 'bronze',
    title: "Joker's wild",
    description: 'Play a Joker.',
    counter: 'c8_jokers_played',
    points: 15,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'eight_ball',
    tier: 'silver',
    title: 'Eight ball',
    description: 'Play three 8s in one game.',
    counter: 'c8_three_eights_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'stacked',
    tier: 'silver',
    title: 'Stacked',
    description: 'Stack a Pick Two on top of another Pick Two.',
    counter: 'c8_pick_twos_stacked',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'suit_run',
    tier: 'silver',
    title: 'Suit run',
    description: 'Play four cards of the same suit in a row.',
    counter: 'c8_suit_run_4_games',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'rank_run',
    tier: 'silver',
    title: 'Rank run',
    description: 'Play three cards of the same rank in a row.',
    counter: 'c8_rank_run_3_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'quickfire',
    tier: 'silver',
    title: 'Quickfire',
    description: 'Win in eight turns or fewer.',
    counter: 'c8_quickfire_wins',
    points: 35,
    sortOrder: 120,
  },
  {
    suffix: 'survivor',
    tier: 'silver',
    title: 'Survivor',
    description: 'Draw ten or more cards in a game and still win it.',
    counter: 'c8_survivor_wins',
    points: 35,
    sortOrder: 130,
  },
  {
    suffix: 'full_deck',
    tier: 'silver',
    title: 'Full deck',
    description: 'Play a card of every suit in one game.',
    counter: 'c8_all_suits_games',
    points: 25,
    sortOrder: 140,
  },
  {
    suffix: 'skip_to_end',
    tier: 'silver',
    title: 'Skip to the end',
    description: 'Play three Skips in one game.',
    counter: 'c8_three_skips_games',
    points: 30,
    sortOrder: 150,
  },
  {
    suffix: 'round_trip',
    tier: 'silver',
    title: 'Round trip',
    description: 'Play two Queens in one game.',
    counter: 'c8_two_queens_games',
    points: 25,
    sortOrder: 160,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'untouched',
    tier: 'gold',
    title: 'Untouched',
    description: 'Finish a game of three or more players without ever taking a Pick Two.',
    counter: 'c8_no_pick_two_games',
    points: 60,
    sortOrder: 170,
  },
  {
    suffix: 'eight_finish',
    tier: 'gold',
    title: 'Eight finish',
    description: 'Win by playing an 8 as your final card.',
    counter: 'c8_eight_finish_wins',
    points: 70,
    sortOrder: 180,
  },
  {
    suffix: 'comeback',
    tier: 'gold',
    title: 'Comeback',
    description: 'Win a game after holding twelve or more cards at some point.',
    counter: 'c8_comeback_wins',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'full_table',
    tier: 'gold',
    title: 'Full table',
    description: 'Win a six-player game.',
    counter: 'c8_full_table_wins',
    points: 60,
    sortOrder: 200,
  },
  {
    suffix: 'joker_finish',
    tier: 'gold',
    title: 'Joker finish',
    description: 'Win by playing a Joker as your final card.',
    counter: 'c8_joker_finish_wins',
    points: 80,
    sortOrder: 210,
  },
  {
    suffix: 'suit_master',
    tier: 'gold',
    title: 'Suit master',
    description: 'Win a game having played all four suits and an 8.',
    counter: 'c8_suit_master_wins',
    points: 70,
    sortOrder: 220,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'platinum',
    title: 'Flawless',
    description: 'Win a game of three or more players without drawing a single card.',
    counter: 'c8_flawless_wins',
    points: 150,
    sortOrder: 230,
    hidden: true,
  },
  {
    suffix: 'suit_sweep',
    tier: 'platinum',
    title: 'Suit sweep',
    description: 'Win having played all four suits, an 8 and a Joker.',
    counter: 'c8_suit_sweep_wins',
    points: 150,
    sortOrder: 240,
    hidden: true,
  },
]
