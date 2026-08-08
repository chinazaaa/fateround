import type { SystemTrophySpec } from './types'

/**
 * UNO — derived at finish from the per-game accumulator the engine folds forward on every action.
 * See `./game-facts/uno.ts` for how each counter is produced and `src/lib/uno.ts` for the in-play
 * folding.
 *
 * Ordered bronze → platinum, thresholds from the brief. Four of the brief's thirty are absent:
 *
 *  - "First Hand" (finish a game) and the "UNO Champion" win track are `games_played` / `games_won`
 *    rules the generic catalog already builds for every game; duplicating them would seed two
 *    trophies for one achievement.
 *  - "Perfect Call" (call UNO correctly five GAMES in a row) is a cross-game streak, not a per-game
 *    fact. Counters are lifetime sums, so a run of consecutive games is not expressible as one
 *    summable integer and there is no such streak counter to hang it on.
 *  - "Cleanout" (make opponents draw 12+ cards) cannot be counted: Draw 2 / Draw 4 penalties are
 *    drawn in the VICTIM's turn handler, in the victim's own row, with no atomic link back to whoever
 *    set the penalty (and a penalty may be stacked, challenged or defended before it lands). Same
 *    reasoning as Crazy Eights' dropped "Heavy Hand" — UNO has no equivalent of Whot's General Market
 *    (a mass draw inflicted inside the setter's own handler), so there is nothing to credit atomically.
 *
 * TEAM-UP. Both members of the winning team are named winners upstream (`expandUnoTeamWin`), so the
 * win-gated trophies below reach each teammate for the ones they individually satisfy.
 *
 * PLAYER-COUNT GATES (brief footnote). #21 Full Lobby needs eight seats; #19 Never Drawn, #25
 * Untouchable and #27 Flawless require three-plus seats so they cannot be farmed heads-up. Seats is
 * `ctx.seated.length`, which counts finishers via `finish_order`, so it is the real room size.
 */
export const UNO: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'uno_call',
    tier: 'bronze',
    title: 'Last Card!',
    description: 'Correctly call last card on your second-to-last play.',
    counter: 'uno_uno_calls',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'skipped',
    tier: 'bronze',
    title: 'Skipped',
    description: 'Play a Skip card.',
    counter: 'uno_skips',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'about_turn',
    tier: 'bronze',
    title: 'About Turn',
    description: 'Play a Reverse card.',
    counter: 'uno_reverses',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'draw_two',
    tier: 'bronze',
    title: 'Draw 2',
    description: 'Play a Draw 2.',
    counter: 'uno_draw_twos',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'going_wild',
    tier: 'bronze',
    title: 'Going Wild',
    description: 'Play a Wild card.',
    counter: 'uno_wilds',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'colour_me',
    tier: 'bronze',
    title: 'Colour Me',
    description: 'Change the colour five times in one game.',
    counter: 'uno_color_changes_5_games',
    points: 15,
    sortOrder: 60,
  },
  {
    suffix: 'deck_diver',
    tier: 'bronze',
    title: 'Deck Diver',
    description: 'Draw five cards in one game.',
    counter: 'uno_drew_5_games',
    points: 10,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'caught_out',
    tier: 'silver',
    title: 'Caught Out',
    description: 'Catch an opponent who forgot to call last card.',
    counter: 'uno_catches',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'four_play',
    tier: 'silver',
    title: 'Four Play',
    description: 'Play a Draw 4.',
    counter: 'uno_wild_draw_fours',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'challenger',
    tier: 'silver',
    title: 'Challenger',
    description: 'Successfully challenge a Draw 4.',
    counter: 'uno_challenges_won',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'called_your_bluff',
    tier: 'silver',
    title: 'Called Your Bluff',
    description: 'Survive a challenge on your own Draw 4.',
    counter: 'uno_bluff_survived',
    points: 35,
    sortOrder: 110,
  },
  {
    suffix: 'stack_em',
    tier: 'silver',
    title: "Stack 'Em",
    description: 'Stack a Draw 2 on a Draw 2.',
    counter: 'uno_draw2_stacked',
    points: 30,
    sortOrder: 120,
  },
  {
    suffix: 'boomerang',
    tier: 'silver',
    title: 'Boomerang',
    description: 'Play two Reverses in one game.',
    counter: 'uno_two_reverses_games',
    points: 25,
    sortOrder: 130,
  },
  {
    suffix: 'rainbow',
    tier: 'silver',
    title: 'Rainbow',
    description: 'Play all four colours in a single Multi-Play sequence.',
    counter: 'uno_rainbow_games',
    points: 30,
    sortOrder: 140,
  },
  {
    suffix: 'quickfire',
    tier: 'silver',
    title: 'Quickfire',
    description: 'Win in eight turns or fewer.',
    counter: 'uno_quickfire_wins',
    points: 35,
    sortOrder: 150,
  },
  {
    suffix: 'colour_blind',
    tier: 'silver',
    title: 'Colour Blind',
    description: 'Win a blocked or timed game holding only one colour.',
    counter: 'uno_one_color_wins',
    points: 30,
    sortOrder: 160,
  },
  {
    suffix: 'survivor',
    tier: 'silver',
    title: 'Survivor',
    description: 'Draw ten or more cards in a game and still win it.',
    counter: 'uno_survivor_wins',
    points: 35,
    sortOrder: 170,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'never_drawn',
    tier: 'gold',
    title: 'Never Drawn',
    description: 'Finish a game of three or more players without ever being made to draw.',
    counter: 'uno_never_drawn_games',
    points: 60,
    sortOrder: 180,
  },
  {
    suffix: 'wild_finish',
    tier: 'gold',
    title: 'Wild Finish',
    description: 'Win by playing a Wild as your final card.',
    counter: 'uno_wild_finish_wins',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'full_lobby',
    tier: 'gold',
    title: 'Full Lobby',
    description: 'Win a game of eight or more players.',
    counter: 'uno_full_lobby_wins',
    points: 70,
    sortOrder: 200,
  },
  {
    suffix: 'comeback',
    tier: 'gold',
    title: 'Comeback',
    description: 'Win a game after holding twelve or more cards at some point.',
    counter: 'uno_comeback_wins',
    points: 70,
    sortOrder: 210,
  },
  {
    suffix: 'action_hero',
    tier: 'gold',
    title: 'Action Hero',
    description: 'Play a Skip, a Reverse, a Draw 2 and a Wild in one game.',
    counter: 'uno_action_hero_games',
    points: 60,
    sortOrder: 220,
  },
  {
    suffix: 'untouchable',
    tier: 'gold',
    title: 'Untouchable',
    description: 'Win a game of three or more players without ever taking a Draw 2 or Draw 4.',
    counter: 'uno_untouchable_wins',
    points: 80,
    sortOrder: 230,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'gold',
    title: 'Flawless',
    description: 'Win a game of three or more players without drawing a single card.',
    counter: 'uno_flawless_wins',
    points: 150,
    sortOrder: 240,
    hidden: true,
  },
  {
    suffix: 'full_circle',
    tier: 'gold',
    title: 'Full Circle',
    description: 'Win a game in which you played every action card type, including the Draw 4.',
    counter: 'uno_full_circle_wins',
    points: 150,
    sortOrder: 250,
    hidden: true,
  },
  {
    suffix: 'last_card_four',
    tier: 'gold',
    title: 'Last Card Four',
    description: 'Win by playing a Draw 4 as your final card.',
    counter: 'uno_wd4_finish_wins',
    points: 150,
    sortOrder: 260,
    hidden: true,
  },

  // ── High Stakes mode (30 trophies) ───────────────────────────────────────────────────────
  // Every trophy below is mode-gated: unoFacts only emits its counter when the finished game
  // ran in No Mercy / High Stakes mode (uno_mode='no_mercy'). Classic Match Up games never
  // credit these, so a player racing to 25 in Classic can't farm the knockout trophies.
  //
  // † in the spec = depends on the Mercy knockout path being implemented. Our engine records
  // knockouts in uno_sessions.eliminated_player_ids and applyMercyKnockout attributes each to
  // whoever set the deadly draw penalty (see engine notes in src/lib/uno.ts).
  //
  // Trophies with counters ending in `_todo` are declared here so the trophy case is complete,
  // but the engine hook that emits them is a follow-up (see game-facts/uno.ts notes). Until then
  // they never fire — which is safe: hidden from the "how do I earn this?" tooltip via the
  // counter's own gte gate.

  // Bronze (9)
  {
    suffix: 'hs_raise_stakes',
    tier: 'bronze',
    title: 'Raise the Stakes',
    description: 'Finish your first High Stakes game.',
    counter: 'uno_hs_games',
    points: 10,
    sortOrder: 71,
  },
  {
    suffix: 'hs_first_blood',
    tier: 'bronze',
    title: 'First Blood',
    description: 'Make an opponent draw with any Draw card in a High Stakes game.',
    counter: 'uno_hs_first_blood_games',
    points: 10,
    sortOrder: 72,
  },
  {
    suffix: 'hs_hand_swap',
    tier: 'bronze',
    title: 'Hand Swap',
    description: 'Play a 7 and swap hands with another player in a High Stakes game.',
    counter: 'uno_hs_swap_games',
    points: 10,
    sortOrder: 73,
  },
  {
    suffix: 'hs_pass_it_on',
    tier: 'bronze',
    title: 'Pass It On',
    description: 'Play a 0 and trigger a hand pass in a High Stakes game.',
    counter: 'uno_hs_pass_games',
    points: 10,
    sortOrder: 74,
  },
  {
    suffix: 'hs_big_draw',
    tier: 'bronze',
    title: 'Big Draw',
    description: 'Play a Draw 6 or Draw 10 in a High Stakes game.',
    counter: 'uno_hs_big_draw_games',
    points: 15,
    sortOrder: 75,
  },
  {
    suffix: 'hs_roulette',
    tier: 'bronze',
    title: 'Roulette',
    description: 'Play a Colour Roulette card in a High Stakes game.',
    counter: 'uno_hs_roulette_games',
    points: 15,
    sortOrder: 76,
  },
  {
    suffix: 'hs_clear_out',
    tier: 'bronze',
    title: 'Clear Out',
    description: 'Play a Discard Colour card in a High Stakes game.',
    counter: 'uno_hs_discard_all_games',
    points: 15,
    sortOrder: 77,
  },
  {
    suffix: 'hs_skip_party',
    tier: 'bronze',
    title: 'Skip Party',
    description: 'Play a Skip All card in a High Stakes game.',
    counter: 'uno_hs_skip_all_games',
    points: 15,
    sortOrder: 78,
  },
  {
    suffix: 'hs_on_the_brink',
    tier: 'bronze',
    title: 'On the Brink',
    description: 'Survive a turn holding 20+ cards without being knocked out.',
    counter: 'uno_hs_brink_games',
    points: 15,
    sortOrder: 79,
  },

  // Silver (11)
  {
    suffix: 'hs_survivor',
    tier: 'silver',
    title: 'Survivor',
    description: 'Win a High Stakes game.',
    counter: 'uno_hs_wins',
    points: 30,
    sortOrder: 170.1,
  },
  {
    suffix: 'hs_stacked',
    tier: 'silver',
    title: 'Stacked',
    description: 'Stack a Draw card on top of another Draw card in a High Stakes game.',
    counter: 'uno_hs_stack_games',
    points: 25,
    sortOrder: 170.2,
  },
  {
    suffix: 'hs_double_stack',
    tier: 'silver',
    title: 'Double Stack',
    description: 'Be part of a Draw-card stack of 3 or more cards.',
    counter: 'uno_hs_stack3plus_games_todo',
    points: 30,
    sortOrder: 170.3,
  },
  {
    suffix: 'hs_twenty_load',
    tier: 'silver',
    title: 'Twenty Load',
    description: 'Make one opponent draw 20+ cards across a single High Stakes game.',
    counter: 'uno_hs_twenty_load_games_todo',
    points: 35,
    sortOrder: 170.4,
  },
  {
    suffix: 'hs_knockout',
    tier: 'silver',
    title: 'Knockout',
    description: 'Knock an opponent out via the 25-card Mercy rule.',
    counter: 'uno_hs_knockouts',
    points: 40,
    sortOrder: 170.5,
  },
  {
    suffix: 'hs_lucky_seven',
    tier: 'silver',
    title: 'Lucky Seven',
    description: 'Swap into a winning hand with a 7 and win the same turn or next.',
    counter: 'uno_hs_lucky_seven_games_todo',
    points: 35,
    sortOrder: 170.6,
  },
  {
    suffix: 'hs_roulette_master',
    tier: 'silver',
    title: 'Roulette Master',
    description: 'Force an opponent to reveal 5+ cards with a single Colour Roulette.',
    counter: 'uno_hs_roulette5_games',
    points: 30,
    sortOrder: 170.7,
  },
  {
    suffix: 'hs_comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win a High Stakes game after holding 20+ cards.',
    counter: 'uno_hs_comeback_wins',
    points: 40,
    sortOrder: 170.8,
  },
  {
    suffix: 'hs_ten_games',
    tier: 'silver',
    title: 'Ten Games',
    description: 'Play 10 High Stakes games.',
    counter: 'uno_hs_games',
    gte: 10,
    points: 30,
    sortOrder: 170.9,
  },
  {
    suffix: 'hs_full_house',
    tier: 'silver',
    title: 'Full House',
    description: 'Win a High Stakes game with 6 or more players.',
    counter: 'uno_hs_full_house_wins',
    points: 35,
    sortOrder: 171.1,
  },
  {
    suffix: 'hs_mercy_dodge',
    tier: 'silver',
    title: 'Mercy Dodge',
    description: 'Win a High Stakes game after being within 3 cards of the 25 knockout.',
    counter: 'uno_hs_mercy_dodge_wins',
    points: 35,
    sortOrder: 171.2,
  },
  {
    suffix: 'hs_chain_breaker',
    tier: 'silver',
    title: 'Chain Breaker',
    description: 'Absorb a stacked Draw penalty of 10+ cards and still win the game.',
    counter: 'uno_hs_chain_breaker_wins',
    points: 40,
    sortOrder: 171.3,
  },

  // Gold (9)
  {
    suffix: 'hs_last_one_standing',
    tier: 'gold',
    title: 'Last One Standing',
    description: 'Win a High Stakes game by outlasting every knockout.',
    counter: 'uno_hs_last_standing_wins',
    points: 70,
    sortOrder: 261,
  },
  {
    suffix: 'hs_double_ko',
    tier: 'gold',
    title: 'Double KO',
    description: 'Knock out two players in a single High Stakes game.',
    counter: 'uno_hs_double_ko_games',
    points: 60,
    sortOrder: 262,
  },
  {
    suffix: 'hs_untouchable',
    tier: 'gold',
    title: 'Untouchable',
    description: 'Win a High Stakes game without ever being made to draw from a Draw card.',
    counter: 'uno_hs_untouchable_wins',
    points: 70,
    sortOrder: 263,
  },
  {
    suffix: 'hs_stack_kingpin',
    tier: 'gold',
    title: 'Stack Kingpin',
    description: 'Win a High Stakes game after sending a stacked penalty of 16+ cards.',
    counter: 'uno_hs_stack_kingpin_wins_todo',
    points: 80,
    sortOrder: 264,
  },
  {
    suffix: 'hs_mass_extinction',
    tier: 'gold',
    title: 'Mass Extinction',
    description: 'Knock out 3 or more players in one High Stakes game.',
    counter: 'uno_hs_mass_extinction_games',
    points: 90,
    sortOrder: 265,
  },
  {
    suffix: 'hs_roulette_executioner',
    tier: 'gold',
    title: 'Roulette Executioner',
    description: 'Make an opponent draw 8+ cards from a single Colour Roulette.',
    counter: 'uno_hs_roulette8_games',
    points: 70,
    sortOrder: 266,
  },
  {
    suffix: 'hs_flawless',
    tier: 'gold',
    title: 'Flawless',
    description: 'Win a High Stakes game without ever holding more than 10 cards.',
    counter: 'uno_hs_flawless_wins',
    points: 90,
    sortOrder: 267,
  },
  {
    suffix: 'hs_master',
    tier: 'gold',
    title: 'High Stakes Master',
    description: 'Win 25 High Stakes games.',
    counter: 'uno_hs_wins',
    gte: 25,
    points: 150,
    sortOrder: 268,
  },
]
