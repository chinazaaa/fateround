import type { SystemTrophySpec } from './types'

/**
 * Yahtzee — derived entirely from the finished scorecard. See `./game-facts/yahtzee.ts`.
 *
 * Ordered bronze → platinum, and the thresholds are the brief's. Yahtzee allows solo play, and
 * every trophy below is earnable alone except the two win trophies — "Winner" and "Table beater"
 * name their player minimums in the description, because the counters behind them are the only
 * ones that read the winners and the seat count.
 *
 * Where the brief asked for something the card cannot support it is simply absent rather than
 * approximated:
 *
 * - "First Card" (finish your first game) and the "Yahtzee Champion" 5/15/30/50 win track are not
 *   here because the generic catalog already builds exactly those from `games_played` and
 *   `games_won` for every game; a second copy would be the same trophy twice.
 * - "Stand Pat", "Double Yahtzee", "Opening Salvo", "Efficient" and "Triple Yahtzee" all need
 *   per-turn ROLL detail — how many rolls a turn took, how many Yahtzees were rolled rather than
 *   scored. Only the finished card is persisted, one value per category, so the builder emits
 *   nothing for any of them: the scorecard survives the game, the individual rolls do not.
 * The Yahtzee Bonus (+100 for a Yahtzee rolled with the box already at 50) and the Joker rule
 * (a Yahtzee scored after the box is filled fills a lower box at its max) are BOTH implemented —
 * standard Hasbro scoring, not house rules. Their trophies are below. Both unlock the moment
 * they happen (`instant: true`) because the score handler knows, and both are also derivable at
 * finish: the bonus from the stored count, the Joker from a stored flag (it can't be read back
 * from the final numbers).
 */
export const YAHTZEE: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'full_house',
    tier: 'bronze',
    title: 'Full house',
    description: 'Score a full house.',
    counter: 'yahtzee_full_house_scored',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'small_straight',
    tier: 'bronze',
    title: 'Small straight',
    description: 'Score a small straight.',
    counter: 'yahtzee_small_straight_scored',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'large_straight',
    tier: 'bronze',
    title: 'Large straight',
    description: 'Score a large straight.',
    counter: 'yahtzee_large_straight_scored',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'three_kind',
    tier: 'bronze',
    title: 'Three of a kind',
    description: 'Score three of a kind.',
    counter: 'yahtzee_three_kind_scored',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'four_kind',
    tier: 'bronze',
    title: 'Four of a kind',
    description: 'Score four of a kind.',
    counter: 'yahtzee_four_kind_scored',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'chance_25',
    tier: 'bronze',
    title: 'Taking a chance',
    description: 'Score 25 or more in Chance.',
    counter: 'yahtzee_chance_25_plus',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    // Unlocks the moment it is scored — processYahtzeeScore already knows the category and the
    // value, so there is nothing to re-derive. See instant-unlock.ts.
    instant: true,
    suffix: 'yahtzee_scored',
    tier: 'silver',
    title: 'YAHTZEE!',
    description: 'Score a Yahtzee — five of a kind, taken in the Yahtzee box for 50.',
    counter: 'yahtzee_scored_yahtzee',
    points: 40,
    sortOrder: 70,
  },
  {
    suffix: 'upper_bonus',
    tier: 'silver',
    title: 'Bonus hunter',
    description: 'Earn the 35-point upper-section bonus.',
    counter: 'yahtzee_upper_bonus_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'sixes_24',
    tier: 'silver',
    title: 'Sixes full',
    description: 'Score 24 or more in Sixes.',
    counter: 'yahtzee_sixes_24_plus',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'century',
    tier: 'silver',
    title: 'Century',
    description: 'Finish a card with 200 or more points.',
    counter: 'yahtzee_games_200_plus',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'both_straights',
    tier: 'silver',
    title: 'Both straights',
    description: 'Score a small and a large straight in one game.',
    counter: 'yahtzee_both_straights_games',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'no_zeros',
    tier: 'silver',
    title: 'No zeros',
    description: 'Fill all thirteen categories without scoring a single zero.',
    counter: 'yahtzee_no_zero_games',
    points: 40,
    sortOrder: 120,
  },
  {
    suffix: 'four_kind_27',
    tier: 'silver',
    title: 'Heavy hitter',
    description: 'Score 27 or more in Four of a Kind.',
    counter: 'yahtzee_four_kind_27_plus',
    points: 30,
    sortOrder: 130,
  },
  {
    suffix: 'upper_70',
    tier: 'silver',
    title: 'Upper cut',
    description: 'Score 70 or more in the upper section.',
    counter: 'yahtzee_upper_70_plus',
    points: 35,
    sortOrder: 140,
  },
  {
    suffix: 'multiplayer_win',
    tier: 'silver',
    title: 'Winner',
    description: 'Win a game against at least one other player.',
    counter: 'yahtzee_multiplayer_wins',
    points: 35,
    sortOrder: 150,
  },
  {
    suffix: 'chance_30',
    tier: 'silver',
    title: 'Perfect chance',
    description: 'Score the maximum 30 in Chance.',
    counter: 'yahtzee_chance_perfect_30',
    points: 40,
    sortOrder: 160,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'high_roller',
    tier: 'gold',
    title: 'High roller',
    description: 'Finish a card with 250 or more points.',
    counter: 'yahtzee_games_250_plus',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'big_table_win',
    tier: 'gold',
    title: 'Table beater',
    description: 'Win a game at a table of four or more players.',
    counter: 'yahtzee_big_table_wins',
    points: 70,
    sortOrder: 180,
  },
  {
    suffix: 'lower_sweep',
    tier: 'gold',
    title: 'Full sweep',
    description: 'Score every lower-section category above zero.',
    counter: 'yahtzee_lower_sweep_games',
    points: 80,
    sortOrder: 190,
  },
  {
    // Fires the moment the +100 lands — processYahtzeeScore knows it. Also derivable from the
    // stored bonus count at finish.
    instant: true,
    suffix: 'bonus',
    tier: 'gold',
    title: 'Yahtzee bonus',
    description: 'Earn a 100-point Yahtzee bonus — roll a Yahtzee with your Yahtzee box already at 50.',
    counter: 'yahtzee_bonus_earned',
    points: 70,
    sortOrder: 200,
  },
  {
    instant: true,
    suffix: 'joker',
    tier: 'gold',
    title: 'Joker',
    description: 'Score a Yahtzee under the Joker rule after your Yahtzee box is filled.',
    counter: 'yahtzee_joker_used',
    points: 70,
    sortOrder: 210,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'three_hundred_club',
    tier: 'platinum',
    title: '300 club',
    description: 'Finish a card with 300 or more points.',
    counter: 'yahtzee_games_300_plus',
    points: 150,
    sortOrder: 220,
  },
  {
    suffix: 'flawless_card',
    tier: 'platinum',
    title: 'Flawless card',
    description: 'Earn the upper bonus and score every category above zero.',
    counter: 'yahtzee_flawless_card_games',
    points: 150,
    sortOrder: 230,
    hidden: true,
  },
]
