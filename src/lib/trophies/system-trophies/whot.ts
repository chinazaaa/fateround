import { distinctCrit, type SystemTrophySpec } from './types'

/**
 * Whot — derived at finish from the per-game accumulator the engine folds forward on every turn.
 * See `./game-facts/whot.ts` for how each counter is produced and `src/lib/whot.ts` for the in-play
 * folding.
 *
 * Ordered bronze → platinum, thresholds from the brief. Two of the brief's thirty are absent, and a
 * few are reworked to the engine:
 *
 *  - "Dealt In" (finish a game) and the "Whot Champion" win track are `games_played` / `games_won`
 *    rules the generic catalog already builds for every game; duplicating them would seed two
 *    trophies for one achievement.
 *  - "Market Forces" (make opponents draw 15+ cards) counts General Market draws only — the one
 *    penalty a player inflicts inside their OWN turn handler, so it can be credited atomically. Pick
 *    2/3 land in the VICTIM's handler with no atomic link back to the setter (a penalty may be
 *    stacked or defended before it lands), exactly the reason Crazy Eights dropped "Heavy Hand".
 *  - "Naija Legend" is a distinct SET ("win at every player count 2–6"), not a summable counter, so
 *    it uses `distinctCrit` over `whot_win_counts` (a member per room size, unioned on each win).
 *
 * PLAYER-COUNT GATES (brief footnote). #22 Full Table needs six seats; #19 Untouched, #27
 * Untouchable and #29 Market Forces require three-plus seats so they cannot be farmed heads-up where
 * penalties barely bite. Seats is `ctx.seated.length`, which counts finishers (a shed-your-hand
 * winner is flagged `spectator` but rescued via `finish_order`), so it is the real room size.
 */
export const WHOT: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'to_market',
    tier: 'bronze',
    title: 'To Market',
    description: 'Go to market five times in one game.',
    counter: 'whot_market_visits_5_games',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'pick_two',
    tier: 'bronze',
    title: 'Pick Two',
    description: 'Play a Pick Two (2) and make the next player draw.',
    counter: 'whot_pick_twos',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'shape_shifter',
    tier: 'bronze',
    title: 'Shape Shifter',
    description: 'Play a WHOT card and call a shape.',
    counter: 'whot_shape_calls',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'hold_up',
    tier: 'bronze',
    title: 'Hold Up',
    description: 'Play a Hold On (1) to take another turn.',
    counter: 'whot_hold_ons',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'suspended',
    tier: 'bronze',
    title: 'Suspended',
    description: 'Play a Suspension (8) to skip the next player.',
    counter: 'whot_suspensions',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'general_market',
    tier: 'bronze',
    title: 'General Market',
    description: 'Play a General Market (14) and make everyone draw.',
    counter: 'whot_general_markets',
    points: 10,
    sortOrder: 60,
  },
  {
    suffix: 'feel_the_fear',
    tier: 'bronze',
    title: 'Feel the Fear',
    description: 'Play a Pick Three (5).',
    counter: 'whot_pick_threes',
    points: 10,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'defender',
    tier: 'silver',
    title: 'Defender',
    description: 'Block a Pick Two by stacking your own.',
    counter: 'whot_pick_twos_stacked',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'wall_of_five',
    tier: 'silver',
    title: 'Wall of Five',
    description: 'Block a Pick Three by stacking your own.',
    counter: 'whot_pick_threes_stacked',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'chain_gang',
    tier: 'silver',
    title: 'Chain Gang',
    description: 'Play three Hold Ons in a single turn chain.',
    counter: 'whot_holdon_chain_3_games',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'shape_lock',
    tier: 'silver',
    title: 'Shape Lock',
    description: 'Play four cards of the same shape in a row.',
    counter: 'whot_shape_run_4_games',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'market_crash',
    tier: 'silver',
    title: 'Market Crash',
    description: 'Play General Market twice in one game.',
    counter: 'whot_two_markets_games',
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'survivor',
    tier: 'silver',
    title: 'Survivor',
    description: 'Draw five or more penalty cards in a game and still win it.',
    counter: 'whot_survivor_wins',
    points: 35,
    sortOrder: 130,
  },
  {
    suffix: 'star_finish',
    tier: 'silver',
    title: 'Star Finish',
    description: 'Win with a Star card as your final card.',
    counter: 'whot_star_finish_wins',
    points: 35,
    sortOrder: 140,
  },
  {
    suffix: 'double_whot',
    tier: 'silver',
    title: 'Double Whot',
    description: 'Hold two WHOT cards at the same time.',
    counter: 'whot_two_whots_games',
    points: 25,
    sortOrder: 150,
  },
  {
    suffix: 'fast_deal',
    tier: 'silver',
    title: 'Fast Deal',
    description: 'Win in ten turns or fewer.',
    counter: 'whot_fast_wins',
    points: 35,
    sortOrder: 160,
  },
  {
    suffix: 'stack_attack',
    tier: 'silver',
    title: 'Stack Attack',
    description: 'Be part of a Pick Two chain that reaches three or more stacks.',
    counter: 'whot_stack_attack_games',
    points: 30,
    sortOrder: 170,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'untouched',
    tier: 'gold',
    title: 'Untouched',
    description: 'Finish a game of three or more players without ever being hit by a Pick Two or Pick Three.',
    counter: 'whot_untouched_games',
    points: 60,
    sortOrder: 180,
  },
  {
    suffix: 'shape_master',
    tier: 'gold',
    title: 'Shape Master',
    description: 'Win a game having played all five shapes.',
    counter: 'whot_shape_master_wins',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'wildcard_finish',
    tier: 'gold',
    title: 'Wildcard Finish',
    description: 'Win by playing a WHOT (20) as your last card.',
    counter: 'whot_wildcard_finish_wins',
    points: 80,
    sortOrder: 200,
  },
  {
    suffix: 'full_table',
    tier: 'gold',
    title: 'Full Table',
    description: 'Win a six-player game.',
    counter: 'whot_full_table_wins',
    points: 60,
    sortOrder: 210,
  },
  {
    suffix: 'comeback',
    tier: 'gold',
    title: 'Comeback',
    description: 'Win a game after holding ten or more cards at some point.',
    counter: 'whot_comeback_wins',
    points: 70,
    sortOrder: 220,
  },
  {
    suffix: 'head_to_head',
    tier: 'gold',
    title: 'Head to Head',
    description: 'Win a two-player game without ever going to market.',
    counter: 'whot_head_to_head_wins',
    points: 70,
    sortOrder: 230,
  },
  {
    suffix: 'light_hand',
    tier: 'gold',
    title: 'Light Hand',
    description: 'Win a blocked or timed game holding five points or fewer.',
    counter: 'whot_light_hand_wins',
    points: 60,
    sortOrder: 240,
  },
  {
    suffix: 'no_mercy',
    tier: 'gold',
    title: 'No Mercy',
    description: 'Play a Pick Two, a Pick Three and a General Market in one game.',
    counter: 'whot_no_mercy_games',
    points: 70,
    sortOrder: 250,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'untouchable',
    tier: 'platinum',
    title: 'Untouchable',
    description: 'Win a game of three or more players without drawing a single card.',
    counter: 'whot_untouchable_wins',
    points: 150,
    sortOrder: 260,
    hidden: true,
  },
  {
    suffix: 'naija_legend',
    tier: 'platinum',
    title: 'Naija Legend',
    description: 'Win a Whot game at every player count from two to six.',
    criteria: distinctCrit('whot_win_counts', 5),
    points: 200,
    sortOrder: 270,
    hidden: true,
  },
  {
    suffix: 'market_forces',
    tier: 'platinum',
    title: 'Market Forces',
    description: 'Make opponents draw fifteen or more cards through General Market in one game.',
    counter: 'whot_market_forces_games',
    points: 150,
    sortOrder: 280,
    hidden: true,
  },
]
