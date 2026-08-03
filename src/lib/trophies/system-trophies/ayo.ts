import type { SystemTrophySpec } from './types'

/**
 * Ayo (traditional) — folded at finish from `ayo_sessions` (captured seeds, houses won, win
 * streak) and the paired `a_stats` / `b_stats` accumulators. See `./game-facts/ayo.ts`,
 * `../../ayo.ts`, and migration 20260812040000.
 *
 * RECONCILED AGAINST THE ACTUAL ENGINE. The Wave-2 brief predates the traditional-rules rewrite
 * (PR #746) and several of its conditions are OWARE mechanics that traditional Ayo does not have.
 * In traditional play a capture is always exactly four seeds — a house that a relay lap completes
 * to four, taken by the mover — so there is no "capture a house of 2/3", no linked/chained
 * multi-house capture, and no feeding rule. The clock is a per-PLAYER total (0/30/180/300/600s),
 * not per move. The list below is corrected to what the engine can actually witness.
 *
 * OMITTED — already built generically for every game, so a second copy is the same trophy:
 *  - #1 "First Sowing" (finish a game) and #16 "Ten Games" ≈ the generic games_played track.
 *  - #9 "Ọta" (first win) and #30 "Ayo Champion" (win 5/15/30/50) ARE the generic games_won track.
 *
 * DROPPED — an Oware mechanic with no traditional equivalent, and nothing close enough to keep:
 *  - #4 "Two Seeds" / #5 "Three Seeds" — captures are always four, never two or three.
 *  - #7 "Feeding" — the must-sow-into-an-empty-opponent-row rule is Oware-only.
 *  - #11 "Linked Capture" / #19 "Triple Link" / #26 "Quadruple Link" — a traditional move captures
 *    at most one house (the turn ends on the capture), so there is nothing to link.
 *
 * REWORKED — the flavour survives, mapped onto a state the engine really produces:
 *  - #13 "The Sweep" / #17 "Starve" → "Clean Board": win conceding no house to the opponent.
 *  - #15 "Fast Hands" / #25 "Blitz" → win on the 30-second clock / win any timed game (the clock
 *    is a total, so "time to spare on every move" isn't a thing).
 *  - #22 "Clean Board" (never captured from) → win with the opponent on zero houses.
 *  - #29 "Mo Ki Ọta" → win a real game (3+ of your moves) where EVERY move captured a house.
 *  - Two/Three/Five Houses fill the space the linked-capture trophies left, since "houses won" is
 *    the traditional win metric.
 *
 * NOTHING HERE IS `instant`. A mid-round pop needs an `unlockNow` call in the play route, out of
 * scope for this change; every trophy awards at finish through the counters.
 */
export const AYO: SystemTrophySpec[] = [
  // ── Bronze ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_capture',
    tier: 'bronze',
    title: 'First Capture',
    description: 'Capture your first seeds.',
    counter: 'ayo_seeds_captured',
    points: 15,
    sortOrder: 10,
  },
  {
    suffix: 'seed_sower',
    tier: 'bronze',
    title: 'Seed Sower',
    description: 'Sow from all six of your houses in a single game.',
    counter: 'ayo_all_houses_sown',
    points: 15,
    sortOrder: 20,
  },
  {
    suffix: 'ten_seeds',
    tier: 'bronze',
    title: 'Ten Seeds',
    description: 'Capture ten or more seeds in one game.',
    counter: 'ayo_ten_seed_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'big_sow',
    tier: 'bronze',
    title: 'Big Sow',
    description: 'Sow eight or more seeds in a single move.',
    counter: 'ayo_big_sow_games',
    points: 20,
    sortOrder: 40,
  },
  {
    suffix: 'full_lap',
    tier: 'bronze',
    title: 'Full Lap',
    description: 'Sow a move that travels a full lap of the board.',
    counter: 'ayo_full_lap_games',
    points: 20,
    sortOrder: 50,
  },
  {
    suffix: 'ope',
    tier: 'bronze',
    title: 'Ọpẹ',
    description: 'Lose a game — a badge of honour, you played.',
    counter: 'ayo_losses',
    points: 15,
    sortOrder: 60,
  },
  // ── Silver ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'two_houses',
    tier: 'silver',
    title: 'Two Houses',
    description: 'Win two or more houses in a single game.',
    counter: 'ayo_two_house_games',
    points: 35,
    sortOrder: 80,
  },
  {
    suffix: 'even_split',
    tier: 'silver',
    title: 'Even Split',
    description: 'Draw a game on equal houses.',
    counter: 'ayo_draws',
    points: 35,
    sortOrder: 90,
  },
  {
    suffix: 'half_board',
    tier: 'silver',
    title: 'Half the Board',
    description: 'Capture twenty-four or more seeds in one game.',
    counter: 'ayo_half_board_games',
    points: 40,
    sortOrder: 100,
  },
  {
    suffix: 'casual_master',
    tier: 'silver',
    title: 'Casual Master',
    description: 'Win an untimed game.',
    counter: 'ayo_untimed_wins',
    points: 35,
    sortOrder: 110,
  },
  {
    suffix: 'fast_hands',
    tier: 'silver',
    title: 'Fast Hands',
    description: 'Win a game on the thirty-second clock.',
    counter: 'ayo_blitz30_wins',
    points: 40,
    sortOrder: 120,
  },
  {
    suffix: 'clean_board',
    tier: 'silver',
    title: 'Clean Board',
    description: 'Win a game without conceding a single house.',
    counter: 'ayo_clean_board_wins',
    points: 45,
    sortOrder: 130,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win after trailing by ten or more seeds.',
    counter: 'ayo_comeback_wins',
    points: 45,
    sortOrder: 140,
  },
  // ── Gold ──────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'three_houses',
    tier: 'gold',
    title: 'Three Houses',
    description: 'Win three or more houses in a single game.',
    counter: 'ayo_three_house_games',
    points: 70,
    sortOrder: 160,
  },
  {
    suffix: 'blitz',
    tier: 'gold',
    title: 'Blitz',
    description: 'Win a timed game.',
    counter: 'ayo_timed_wins',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'dominant',
    tier: 'gold',
    title: 'Dominant',
    description: 'Capture thirty-six or more seeds in one game.',
    counter: 'ayo_dominant_games',
    points: 80,
    sortOrder: 180,
  },
  {
    suffix: 'five_houses',
    tier: 'gold',
    title: 'Five Houses',
    description: 'Win five or more houses in a single game.',
    counter: 'ayo_five_house_games',
    points: 85,
    sortOrder: 190,
  },
  {
    suffix: 'long_game',
    tier: 'gold',
    title: 'Long Game',
    description: 'Win a game lasting sixty or more moves.',
    counter: 'ayo_long_game_wins',
    points: 80,
    sortOrder: 200,
  },
  {
    suffix: 'precision',
    tier: 'gold',
    title: 'Precision',
    description: 'Win with a capture on your final move.',
    counter: 'ayo_precision_wins',
    points: 90,
    sortOrder: 210,
  },
  {
    suffix: 'ota_champion',
    tier: 'gold',
    title: 'Ọta Champion',
    description: 'Win three games in a row.',
    counter: 'ayo_streak3_wins',
    points: 100,
    sortOrder: 220,
  },
  // ── Platinum ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'total_control',
    tier: 'platinum',
    title: 'Total Control',
    description: 'Capture forty-four or more of the forty-eight seeds in one game.',
    counter: 'ayo_total_control_games',
    points: 160,
    sortOrder: 240,
    hidden: true,
  },
  {
    suffix: 'undefeated_ota',
    tier: 'platinum',
    title: 'Undefeated Ọta',
    description: 'Win five games in a row.',
    counter: 'ayo_streak5_wins',
    points: 175,
    sortOrder: 250,
    hidden: true,
  },
  {
    suffix: 'mo_ki_ota',
    tier: 'platinum',
    title: 'Mo Ki Ọta',
    description: 'Win a game having captured a house on every one of your moves.',
    counter: 'ayo_perfect_capture_wins',
    points: 200,
    sortOrder: 260,
    hidden: true,
  },
]
