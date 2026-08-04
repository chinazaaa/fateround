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
 *  - "Cleanout" (make opponents draw 12+ cards) cannot be counted: Draw Two / Draw Four penalties are
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
    title: 'UNO!',
    description: 'Correctly call UNO on your second-to-last card.',
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
    title: 'Draw Two',
    description: 'Play a Draw Two.',
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
    description: 'Catch an opponent who forgot to call UNO.',
    counter: 'uno_catches',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'four_play',
    tier: 'silver',
    title: 'Four Play',
    description: 'Play a Wild Draw Four.',
    counter: 'uno_wild_draw_fours',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'challenger',
    tier: 'silver',
    title: 'Challenger',
    description: 'Successfully challenge a Wild Draw Four.',
    counter: 'uno_challenges_won',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'called_your_bluff',
    tier: 'silver',
    title: 'Called Your Bluff',
    description: 'Survive a challenge on your own Wild Draw Four.',
    counter: 'uno_bluff_survived',
    points: 35,
    sortOrder: 110,
  },
  {
    suffix: 'stack_em',
    tier: 'silver',
    title: "Stack 'Em",
    description: 'Stack a Draw Two on a Draw Two.',
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
    description: 'Play a Skip, a Reverse, a Draw Two and a Wild in one game.',
    counter: 'uno_action_hero_games',
    points: 60,
    sortOrder: 220,
  },
  {
    suffix: 'untouchable',
    tier: 'gold',
    title: 'Untouchable',
    description: 'Win a game of three or more players without ever taking a Draw Two or Draw Four.',
    counter: 'uno_untouchable_wins',
    points: 80,
    sortOrder: 230,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'platinum',
    title: 'Flawless',
    description: 'Win a game of three or more players without drawing a single card.',
    counter: 'uno_flawless_wins',
    points: 150,
    sortOrder: 240,
    hidden: true,
  },
  {
    suffix: 'full_circle',
    tier: 'platinum',
    title: 'Full Circle',
    description: 'Win a game in which you played every action card type, including the Wild Draw Four.',
    counter: 'uno_full_circle_wins',
    points: 150,
    sortOrder: 250,
    hidden: true,
  },
  {
    suffix: 'last_card_four',
    tier: 'platinum',
    title: 'Last Card Four',
    description: 'Win by playing a Wild Draw Four as your final card.',
    counter: 'uno_wd4_finish_wins',
    points: 150,
    sortOrder: 260,
    hidden: true,
  },
]
