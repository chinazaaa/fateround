import type { SystemTrophySpec } from './types'

/**
 * Chess — derived at finish by replaying `chess_sessions.pgn`. See `./game-facts/chess.ts`.
 *
 * Ordered bronze → platinum, and the wording follows the brief wherever the replay actually
 * decides the thing. Where it does not, the trophy is absent rather than approximated:
 *
 *  - "Finish your first game", "Play 10 games" and the Chess Champion win track are not here;
 *    they are `games_played` / `games_won` rules the generic catalog already builds for every
 *    game, and duplicating them would seed two trophies for one achievement.
 *  - "Full Arsenal" (win by checkmate AND on time AND by resignation) is not here: a rule is a
 *    single `counter >= n`, so a set of three different win reasons cannot be expressed. The
 *    resignation leg is covered on its own by 'concession' below.
 *
 * Two brief trophies the replay CAN decide, so they ARE here:
 *  - "Immortal" ('immortal', `chess_wins_queen_sac`): won while your queen was captured and the
 *    opponent's was not. Not the literal "sacrifice" — no engine eval judges intent — but a
 *    plain queen trade is excluded, so it is not a freebie. Distinct from "Queenless"
 *    ('queenless', `chess_wins_after_queen_loss`), which only needs your own queen gone.
 *  - "Smothered" ('smothered', `chess_wins_smothered`): the strict form of a knight mate, where
 *    the mated king is walled in by its own pieces. The looser knight mate is its own trophy.
 *
 * Two counters are deliberately worded loosely, for reasons the builder documents: a forfeit on
 * leave is recorded as a resignation, and a stalemate is scored for BOTH players.
 */
export const CHESS: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_blood',
    tier: 'bronze',
    title: 'First blood',
    description: 'Capture your first piece.',
    counter: 'chess_captures',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'check',
    tier: 'bronze',
    title: 'Check',
    description: 'Put your opponent in check.',
    counter: 'chess_checks_given',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'castled',
    tier: 'bronze',
    title: 'Castled',
    description: 'Castle kingside or queenside.',
    counter: 'chess_castles',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'promotion',
    tier: 'bronze',
    title: 'Promotion',
    description: 'Promote a pawn.',
    counter: 'chess_promotions',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'trade_up',
    tier: 'bronze',
    title: 'Trade up',
    description: "Capture your opponent's queen.",
    counter: 'chess_queens_captured',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'long_castle',
    tier: 'bronze',
    title: 'Long castle',
    description: 'Castle queenside.',
    counter: 'chess_queenside_castles',
    points: 15,
    sortOrder: 60,
  },
  {
    suffix: 'endgame',
    tier: 'bronze',
    title: 'Endgame',
    description: 'Play on to a position with six pieces or fewer on the board.',
    counter: 'chess_endgame_reached',
    points: 15,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'checkmate',
    tier: 'silver',
    title: 'Checkmate',
    description: 'Win a game by checkmate.',
    counter: 'chess_wins_checkmate',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'en_passant',
    tier: 'silver',
    title: 'En passant',
    description: 'Capture a pawn en passant.',
    counter: 'chess_en_passant',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'under_pressure',
    tier: 'silver',
    title: 'Under pressure',
    description: 'Win a timed game with under ten seconds left on your clock.',
    counter: 'chess_wins_under_10s',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'fork',
    tier: 'silver',
    title: 'Fork',
    description: 'Give a check that also attacks another piece.',
    counter: 'chess_forks',
    points: 30,
    sortOrder: 110,
  },
  {
    // A stalemate has no winner and the counter fires for both players, so this is worded as
    // reaching one rather than forcing one.
    suffix: 'stalemate',
    tier: 'silver',
    title: 'Stalemate',
    description: 'Reach a stalemate.',
    counter: 'chess_draws_stalemate',
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'blitz',
    tier: 'silver',
    title: 'Blitz',
    description: 'Win a three-minute game.',
    counter: 'chess_wins_blitz',
    points: 30,
    sortOrder: 130,
  },
  {
    suffix: 'queenless',
    tier: 'silver',
    title: 'Queenless',
    description: 'Win a game in which your queen was captured.',
    counter: 'chess_wins_after_queen_loss',
    points: 35,
    sortOrder: 140,
  },
  {
    suffix: 'underpromotion',
    tier: 'silver',
    title: 'Underpromotion',
    description: 'Promote a pawn to something other than a queen.',
    counter: 'chess_underpromotions',
    points: 35,
    sortOrder: 150,
  },
  {
    suffix: 'double_check',
    tier: 'silver',
    title: 'Double check',
    description: 'Give a check from two pieces at once.',
    counter: 'chess_double_checks',
    points: 40,
    sortOrder: 160,
  },
  {
    // Stands in for the brief's unexpressible "Full Arsenal" set. Worded loosely on purpose: a
    // forfeit on leave is stored as a resignation, so this also counts an opponent who left.
    suffix: 'concession',
    tier: 'silver',
    title: 'Concession',
    description: 'Win a game your opponent did not play to the end.',
    counter: 'chess_wins_resignation',
    points: 25,
    sortOrder: 170,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'quick_mate',
    tier: 'gold',
    title: 'Quick mate',
    description: 'Win by checkmate in twenty moves or fewer.',
    counter: 'chess_wins_mate_in_20',
    points: 70,
    sortOrder: 180,
  },
  {
    suffix: 'material_down',
    tier: 'gold',
    title: 'Material down',
    description: 'Win a game you were behind on material at move twenty.',
    counter: 'chess_wins_material_down_move20',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'two_queens',
    tier: 'gold',
    title: 'Two queens',
    description: 'Have two queens on the board at the same time.',
    counter: 'chess_two_queens_games',
    points: 60,
    sortOrder: 200,
  },
  {
    // The brief asked for "on time in a three-minute game". A rule is one counter, and the two
    // halves are separate counters, so this is the win-on-time half; 'blitz' covers the other.
    suffix: 'flag_fighter',
    tier: 'gold',
    title: 'Flag fighter',
    description: 'Win a game on time.',
    counter: 'chess_wins_timeout',
    points: 60,
    sortOrder: 210,
  },
  {
    suffix: 'clean_sheet',
    tier: 'gold',
    title: 'Clean sheet',
    description: 'Win a game without losing a single piece.',
    counter: 'chess_wins_clean_sheet',
    points: 80,
    sortOrder: 220,
  },
  {
    suffix: 'back_rank',
    tier: 'gold',
    title: 'Back rank',
    description: 'Win with a back-rank checkmate.',
    counter: 'chess_wins_back_rank',
    points: 70,
    sortOrder: 230,
  },
  {
    suffix: 'long_game',
    tier: 'gold',
    title: 'Long game',
    description: 'Win a game lasting sixty moves or more.',
    counter: 'chess_wins_60_moves',
    points: 60,
    sortOrder: 240,
  },
  {
    // Knight mate, not smothered mate: the builder only requires a knight among the checkers.
    suffix: 'knight_mate',
    tier: 'gold',
    title: 'Knight mate',
    description: 'Win with a knight delivering the checkmate.',
    counter: 'chess_wins_knight_mate',
    points: 80,
    sortOrder: 250,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'miniature',
    tier: 'platinum',
    title: 'Miniature',
    description: 'Win by checkmate in twelve moves or fewer.',
    counter: 'chess_wins_mate_in_12',
    points: 150,
    sortOrder: 260,
    hidden: true,
  },
  {
    suffix: 'smothered',
    tier: 'platinum',
    title: 'Smothered',
    description: 'Win by smothered mate — a knight mates a king hemmed in by its own pieces.',
    counter: 'chess_wins_smothered',
    points: 150,
    sortOrder: 270,
    hidden: true,
  },
  {
    suffix: 'immortal',
    tier: 'platinum',
    title: 'Immortal',
    description: 'Win a game having given up your queen while your opponent kept theirs.',
    counter: 'chess_wins_queen_sac',
    points: 150,
    sortOrder: 280,
  },
]
