/**
 * The counter vocabulary — what a trophy rule is allowed to talk about.
 *
 * THIS FILE IS THE PRODUCT SURFACE, not the trophy list. A trophy is a row in `trophies`
 * that an admin can write; a *counter* is a measurement the server emits, and only code can
 * add one. So the breadth here decides how much can be built without a deploy:
 *
 *   - "Win 25 games"            → composable today, because `games_won` exists
 *   - "Win without drawing"     → needs a `wins_no_draw` counter emitted by the card games
 *
 * The registry is exported so `/admin/trophies` can *show* the vocabulary while someone is
 * writing a rule. Without that, "admin-editable" quietly means "editable if you remember the
 * counter names", and the first typo produces a trophy that is simply never earned — with no
 * error, because an unknown counter reads as zero by design.
 *
 * Adding a counter here does NOT make it real. It has to be emitted by the award pass too.
 * `availability` records how far along each one is, so the admin UI can grey out the ones that
 * would never fire rather than offering a rule that silently can't be satisfied.
 */

export type CounterScope =
  /** Tracked per game type, and also aggregated globally. */
  | 'per-game'
  /** Only meaningful across all games. */
  | 'global'

export type CounterAvailability =
  /** Emitted for every game type today. */
  | 'universal'
  /**
   * Emitted only where the server can actually determine it. `games_won` is the live example:
   * there is no universal winner on this stack, so a "win" rule silently never fires for a
   * game whose outcome the server can't resolve. `./outcome.ts` maps the 16 game types where
   * it can — call `gameTypesWithWinners()` for the current list rather than hardcoding it, and
   * warn in the admin UI when a rule targets a game type outside it.
   */
  | 'partial'
  /** Declared for the catalog's benefit, not yet emitted anywhere. */
  | 'planned'

export type CounterDef = {
  key: string
  label: string
  description: string
  scope: CounterScope
  availability: CounterAvailability
  /**
   * How this measure reads in a sentence, with `{n}` for the threshold and `{s}` for a plural
   * "s". Exists so the admin editor can say "won at least 25 games" instead of "games won of at
   * least 25" — the whole point of the sentence is that someone can check the rule without
   * knowing the format, and that only works if it reads like English.
   */
  phrase: string
}

export type DistinctDef = {
  key: string
  label: string
  description: string
  availability: CounterAvailability
  /** See `CounterDef.phrase`. */
  phrase: string
}

/**
 * Scalar counters, addressable by `{ type: 'counter', counter: <key> }`.
 *
 * Deliberately broader than the launch catalog needs. Emitting a counter nobody uses yet costs
 * one key in a jsonb blob; discovering later that you need it costs a deploy and a backfill,
 * and the backfill is impossible because the games it would have measured are already over.
 */
export const COUNTERS: readonly CounterDef[] = [
  {
    key: 'games_played',
    label: 'Games played',
    description: 'Finished games this profile took part in as a seated player.',
    scope: 'per-game',
    availability: 'universal',
    phrase: 'finished at least {n} game{s}',
  },
  {
    key: 'games_won',
    label: 'Games won',
    description: 'Finished games this profile won outright.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s}',
  },
  {
    key: 'podium_finishes',
    label: 'Podium finishes',
    description: 'Finished in the top three of a ranked game.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'finished in the top three at least {n} time{s}',
  },
  {
    key: 'days_played',
    label: 'Days played',
    description: 'Distinct calendar days (WAT) with at least one finished game.',
    scope: 'global',
    availability: 'universal',
    phrase: 'played on at least {n} different day{s}',
  },
  {
    key: 'longest_streak',
    label: 'Longest streak',
    description: 'Best run of consecutive days played.',
    scope: 'global',
    availability: 'universal',
    phrase: 'reached a streak of at least {n} day{s} in a row',
  },
  {
    key: 'big_room_games',
    label: 'Big-room games',
    description: 'Finished games with eight or more seated players.',
    scope: 'per-game',
    availability: 'universal',
    phrase: 'finished at least {n} game{s} with 8 or more players',
  },
  {
    key: 'late_night_games',
    label: 'Late-night games',
    description: 'Games finished between midnight and 5am, local to the room.',
    scope: 'global',
    availability: 'universal',
    phrase: 'finished at least {n} game{s} after midnight',
  },
  {
    key: 'host_games',
    label: 'Games hosted',
    description: 'Finished games this profile hosted.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'hosted at least {n} game{s}',
  },
  {
    key: 'comeback_wins',
    label: 'Comeback wins',
    description: 'Won after being last at any scored checkpoint.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'won at least {n} game{s} after being last',
  },
  {
    key: 'perfect_games',
    label: 'Perfect games',
    description: 'Finished with a flawless score by that game’s own definition.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'finished at least {n} perfect game{s}',
  },
  // ── Trivia ──────────────────────────────────────────────────────────────────────────────
  // Emitted by src/lib/trophies/game-facts/trivia.ts, derived at finish from `trivia_answers`.
  // `partial` because they only ever fire for Trivia — a rule using one against another game
  // would parse and save and then never be earned, which the admin UI warns about.
  // Note the `_games` / `_wins` suffixes: these are counted ONCE PER GAME, not per event, so
  // "hit a ten-answer run in at least 1 game" is the readable form. Lifetime totals (correct
  // answers) are the exception and carry no suffix.
  {
    key: 'trivia_correct_answers',
    label: 'Trivia — correct answers',
    description: 'Questions answered correctly, across every Trivia game.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'answered at least {n} Trivia question{s} correctly',
  },
  {
    key: 'trivia_first_correct_games',
    label: 'Trivia — beat everyone to it',
    description: 'Games where you were the first player to answer a question correctly.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'been first to a correct answer in at least {n} game{s}',
  },
  {
    key: 'trivia_speed_demon_games',
    label: 'Trivia — first on five',
    description: 'Games where you were first correct on five or more questions.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'been first correct five times in at least {n} game{s}',
  },
  {
    key: 'trivia_clean_sweep_games',
    label: 'Trivia — first on everything',
    description: 'Games where you were first correct on every question (5+ questions).',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'swept every question in at least {n} game{s}',
  },
  {
    key: 'trivia_buzzer_beater_games',
    label: 'Trivia — buzzer beater',
    description: 'Games with a correct answer inside the last two seconds.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'answered on the buzzer in at least {n} game{s}',
  },
  {
    key: 'trivia_lightning_games',
    label: 'Trivia — lightning',
    description: 'Games where your correct answers averaged under three seconds.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'averaged under three seconds in at least {n} game{s}',
  },
  {
    key: 'trivia_streak_3_games',
    label: 'Trivia — three in a row',
    description: 'Games with a run of three consecutive correct answers.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit a three-answer run in at least {n} game{s}',
  },
  {
    key: 'trivia_streak_5_games',
    label: 'Trivia — five in a row',
    description: 'Games with a run of five consecutive correct answers.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit a five-answer run in at least {n} game{s}',
  },
  {
    key: 'trivia_streak_10_games',
    label: 'Trivia — ten in a row',
    description: 'Games with a run of ten consecutive correct answers.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit a ten-answer run in at least {n} game{s}',
  },
  {
    key: 'trivia_streak_20_games',
    label: 'Trivia — twenty in a row',
    description: 'Games with a run of twenty consecutive correct answers.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit a twenty-answer run in at least {n} game{s}',
  },
  {
    key: 'trivia_full_marks_games',
    label: 'Trivia — full marks',
    description: 'Games of five or more questions answered perfectly.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored full marks in at least {n} game{s}',
  },
  {
    key: 'trivia_perfect_10q_games',
    label: 'Trivia — perfect ten',
    description: 'Games of ten or more questions answered perfectly.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'been perfect over ten questions at least {n} time{s}',
  },
  {
    key: 'trivia_flawless_wins',
    label: 'Trivia — flawless victory',
    description: 'Wins with perfect accuracy over fifteen or more questions.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won flawlessly at least {n} time{s}',
  },
  {
    key: 'trivia_custom_set_games',
    label: 'Trivia — custom sets',
    description: 'Games played on an uploaded question set.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'played at least {n} custom-set game{s}',
  },
  {
    key: 'trivia_big_room_15',
    label: 'Trivia — big room',
    description: 'Games played with fifteen or more players.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'played at least {n} game{s} with 15+ players',
  },
  {
    key: 'trivia_packed_house_wins',
    label: 'Trivia — packed house',
    description: 'Wins in games of twenty or more players.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} with 20+ players',
  },
  {
    key: 'trivia_comeback_wins',
    label: 'Trivia — comeback',
    description: 'Wins from outside the top three at the halfway point.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'come from behind to win at least {n} time{s}',
  },
  {
    key: 'trivia_wire_to_wire_wins',
    label: 'Trivia — wire to wire',
    description: 'Wins where you led after every single question.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'led wire-to-wire in at least {n} win{s}',
  },
  // ── Codewords — from codewords_guesses + player_roles at finish ───────────────────────────────────────────────
  {
    key: 'codewords_own_word_guesses',
    label: 'Own words found',
    description: 'Your team\u2019s own words that you personally uncovered.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'found at least {n} of your team\u2019s words',
  },
  {
    key: 'codewords_neutral_guesses',
    label: 'Neutral words hit',
    description: 'Bystander words you guessed.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit at least {n} neutral word{s}',
  },
  {
    key: 'codewords_opponent_guesses',
    label: 'Opponent words hit',
    description: 'Words you guessed that belonged to the other team.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'handed the other team at least {n} word{s}',
  },
  {
    key: 'codewords_assassin_guesses',
    label: 'Assassin hit',
    description: 'Games ended by you guessing the assassin.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'hit the assassin at least {n} time{s}',
  },
  {
    key: 'codewords_clean_turns',
    label: 'Clean turns',
    description: 'Turns where your team guessed only its own words.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'completed at least {n} clean turn{s}',
  },
  {
    key: 'codewords_clue2_full',
    label: 'Clue for two, all found',
    description: 'Games where a clue for two had both words found.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'landed a full clue for two in at least {n} game{s}',
  },
  {
    key: 'codewords_clue3_full',
    label: 'Clue for three, all found',
    description: 'Games where a clue for three had all three found.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'landed a full clue for three in at least {n} game{s}',
  },
  {
    key: 'codewords_clue4_full',
    label: 'Clue for four, all found',
    description: 'Games where a clue for four had all four found.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'landed a full clue for four in at least {n} game{s}',
  },
  {
    key: 'codewords_clue5_full',
    label: 'Clue for five, all found',
    description: 'Games where a clue for five had all five found.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'landed a full clue for five in at least {n} game{s}',
  },
  {
    key: 'codewords_run4_guesses',
    label: 'Four on one clue',
    description: 'Games where you personally found four words on a single clue.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'found four on one clue in at least {n} game{s}',
  },
  {
    key: 'codewords_run5_guesses',
    label: 'Five on one clue',
    description: 'Games where you personally found five words on a single clue.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'found five on one clue in at least {n} game{s}',
  },
  {
    key: 'codewords_spymaster_wins',
    label: 'Wins as spymaster',
    description: 'Wins where you finished the game as spymaster.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} as spymaster',
  },
  {
    key: 'codewords_operative_wins',
    label: 'Wins as operative',
    description: 'Wins where you finished the game as operative.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} as operative',
  },
  {
    key: 'codewords_assassin_dodged_wins',
    label: 'Assassin dodged',
    description: 'Wins where the assassin was never turned over.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} time{s} with the assassin untouched',
  },
  {
    key: 'codewords_perfect_wins',
    label: 'Perfect game',
    description: 'Wins where your team never guessed a wrong word.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} without a wrong guess',
  },
  {
    key: 'codewords_sweep_wins',
    label: 'Sweep',
    description: 'Wins in four clue runs or fewer.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'swept a win in at least {n} game{s}',
  },
  {
    key: 'codewords_flawless_sweep_wins',
    label: 'Flawless sweep',
    description: 'Wins in three runs with no wrong guesses.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'managed a flawless sweep at least {n} time{s}',
  },
  {
    key: 'codewords_clutch_wins',
    label: 'Clutch',
    description: 'Wins with the opponent one word from taking it.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won from the brink at least {n} time{s}',
  },
  {
    key: 'codewords_comeback_wins',
    label: 'Comeback',
    description: 'Wins from three or more words behind.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'come from behind to win at least {n} time{s}',
  },
  // ── Chess — from replaying chess_sessions.pgn at finish ───────────────────────────────────────────────
  {
    key: 'chess_captures',
    label: 'Pieces captured',
    description: 'Enemy pieces you have taken.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'captured at least {n} piece{s}',
  },
  {
    key: 'chess_checks_given',
    label: 'Checks given',
    description: 'Moves of yours that put the enemy king in check.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'given check at least {n} time{s}',
  },
  {
    key: 'chess_castles',
    label: 'Castled',
    description: 'Times you have castled.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'castled at least {n} time{s}',
  },
  {
    key: 'chess_queenside_castles',
    label: 'Castled queenside',
    description: 'Times you have castled long.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'castled queenside at least {n} time{s}',
  },
  {
    key: 'chess_promotions',
    label: 'Pawns promoted',
    description: 'Pawns you have promoted.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'promoted at least {n} pawn{s}',
  },
  {
    key: 'chess_underpromotions',
    label: 'Underpromotions',
    description: 'Pawns promoted to something other than a queen.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'underpromoted at least {n} time{s}',
  },
  {
    key: 'chess_queens_captured',
    label: 'Queens captured',
    description: 'Enemy queens you have taken.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'captured at least {n} queen{s}',
  },
  {
    key: 'chess_en_passant',
    label: 'En passant',
    description: 'En passant captures you have made.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'captured en passant at least {n} time{s}',
  },
  {
    key: 'chess_forks',
    label: 'Forks',
    description: 'Checks that also attacked another piece.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'forked your opponent at least {n} time{s}',
  },
  {
    key: 'chess_double_checks',
    label: 'Double checks',
    description: 'Positions where two of your pieces checked at once.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'delivered at least {n} double check{s}',
  },
  {
    key: 'chess_endgame_reached',
    label: 'Endgame reached',
    description: 'Games that reached six pieces or fewer.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'reached an endgame in at least {n} game{s}',
  },
  {
    key: 'chess_two_queens_games',
    label: 'Two queens',
    description: 'Games where you had two queens on the board.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'had two queens in at least {n} game{s}',
  },
  {
    key: 'chess_wins_checkmate',
    label: 'Wins by checkmate',
    description: 'Games won by delivering mate.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won by checkmate at least {n} time{s}',
  },
  {
    key: 'chess_wins_timeout',
    label: 'Wins on time',
    description: 'Games won by the opponent running out of clock.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won on time at least {n} time{s}',
  },
  {
    key: 'chess_wins_resignation',
    label: 'Wins by resignation',
    description: 'Games the opponent resigned or abandoned.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won by resignation at least {n} time{s}',
  },
  {
    key: 'chess_wins_under_10s',
    label: 'Wins under pressure',
    description: 'Timed wins with under ten seconds left on your own clock.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won with under ten seconds left at least {n} time{s}',
  },
  {
    key: 'chess_wins_blitz',
    label: 'Blitz wins',
    description: 'Wins in a three-minute game.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} blitz game{s}',
  },
  {
    key: 'chess_wins_after_queen_loss',
    label: 'Wins without your queen',
    description: 'Wins in games where your queen was captured.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} after losing your queen',
  },
  {
    key: 'chess_wins_material_down_move20',
    label: 'Wins from behind',
    description: 'Wins while behind on material at move twenty.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won from material down at least {n} time{s}',
  },
  {
    key: 'chess_wins_clean_sheet',
    label: 'Clean sheet',
    description: 'Wins without losing a single piece.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won without losing a piece at least {n} time{s}',
  },
  {
    key: 'chess_wins_back_rank',
    label: 'Back-rank mates',
    description: 'Wins by mating on the back rank.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'delivered at least {n} back-rank mate{s}',
  },
  {
    key: 'chess_wins_knight_mate',
    label: 'Knight mates',
    description: 'Wins where a knight delivered mate.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'mated with a knight at least {n} time{s}',
  },
  {
    key: 'chess_wins_mate_in_20',
    label: 'Quick mates',
    description: 'Wins by checkmate in twenty moves or fewer.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'mated inside twenty moves at least {n} time{s}',
  },
  {
    key: 'chess_wins_mate_in_12',
    label: 'Miniatures',
    description: 'Wins by checkmate in twelve moves or fewer.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'mated inside twelve moves at least {n} time{s}',
  },
  {
    key: 'chess_wins_60_moves',
    label: 'Long games',
    description: 'Wins in games lasting sixty moves or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won a sixty-move game at least {n} time{s}',
  },
  {
    key: 'chess_draws_stalemate',
    label: 'Stalemates',
    description: 'Games that ended in stalemate.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'reached stalemate at least {n} time{s}',
  },
  // ── Yahtzee — from the persisted 13-cell scorecard ───────────────────────────────────────────────
  {
    key: 'yahtzee_full_house_scored',
    label: 'Full house',
    description: 'Games where you scored a full house.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored a full house in at least {n} game{s}',
  },
  {
    key: 'yahtzee_small_straight_scored',
    label: 'Small straight',
    description: 'Games where you scored a small straight.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored a small straight in at least {n} game{s}',
  },
  {
    key: 'yahtzee_large_straight_scored',
    label: 'Large straight',
    description: 'Games where you scored a large straight.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored a large straight in at least {n} game{s}',
  },
  {
    key: 'yahtzee_three_kind_scored',
    label: 'Three of a kind',
    description: 'Games where you scored three of a kind.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored three of a kind in at least {n} game{s}',
  },
  {
    key: 'yahtzee_four_kind_scored',
    label: 'Four of a kind',
    description: 'Games where you scored four of a kind.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored four of a kind in at least {n} game{s}',
  },
  {
    key: 'yahtzee_chance_25_plus',
    label: 'Chance 25+',
    description: 'Games where Chance scored twenty-five or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored 25+ in Chance in at least {n} game{s}',
  },
  {
    key: 'yahtzee_chance_perfect_30',
    label: 'Perfect chance',
    description: 'Games where Chance scored the maximum thirty.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'maxed Chance in at least {n} game{s}',
  },
  {
    key: 'yahtzee_scored_yahtzee',
    label: 'Yahtzee scored',
    description: 'Games where you took a Yahtzee for fifty.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored a Yahtzee in at least {n} game{s}',
  },
  {
    key: 'yahtzee_upper_bonus_games',
    label: 'Upper bonus',
    description: 'Games where you earned the thirty-five point upper bonus.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'earned the upper bonus in at least {n} game{s}',
  },
  {
    key: 'yahtzee_upper_70_plus',
    label: 'Upper cut',
    description: 'Games with seventy or more in the upper section.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored 70+ upstairs in at least {n} game{s}',
  },
  {
    key: 'yahtzee_sixes_24_plus',
    label: 'Sixes full',
    description: 'Games where Sixes scored twenty-four or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored 24+ in Sixes in at least {n} game{s}',
  },
  {
    key: 'yahtzee_four_kind_27_plus',
    label: 'Heavy hitter',
    description: 'Games where Four of a Kind scored twenty-seven or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored 27+ in four of a kind in at least {n} game{s}',
  },
  {
    key: 'yahtzee_both_straights_games',
    label: 'Both straights',
    description: 'Games where you scored both straights.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'scored both straights in at least {n} game{s}',
  },
  {
    key: 'yahtzee_no_zero_games',
    label: 'No zeros',
    description: 'Games where every category scored above zero.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'filled a card with no zeros at least {n} time{s}',
  },
  {
    key: 'yahtzee_lower_sweep_games',
    label: 'Full sweep',
    description: 'Games where every lower category scored above zero.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'swept the lower section at least {n} time{s}',
  },
  {
    key: 'yahtzee_flawless_card_games',
    label: 'Flawless card',
    description: 'Games with the upper bonus and no zeros anywhere.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'filled a flawless card at least {n} time{s}',
  },
  {
    key: 'yahtzee_games_200_plus',
    label: 'Century',
    description: 'Games finishing on two hundred or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'finished on 200+ at least {n} time{s}',
  },
  {
    key: 'yahtzee_games_250_plus',
    label: 'High roller',
    description: 'Games finishing on two hundred and fifty or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'finished on 250+ at least {n} time{s}',
  },
  {
    key: 'yahtzee_games_300_plus',
    label: 'Three hundred club',
    description: 'Games finishing on three hundred or more.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'finished on 300+ at least {n} time{s}',
  },
  {
    key: 'yahtzee_multiplayer_wins',
    label: 'Wins',
    description: 'Multiplayer games won.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s}',
  },
  {
    key: 'yahtzee_big_table_wins',
    label: 'Table beater',
    description: 'Wins with four or more players.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} with 4+ players',
  },
  {
    key: 'chess_wins_smothered',
    label: 'Chess — smothered mate',
    description: 'Wins by smothered mate: a knight mates a king walled in by its own pieces.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'delivered at least {n} smothered mate{s}',
  },
  {
    key: 'chess_wins_queen_sac',
    label: 'Chess — won without your queen',
    description: 'Wins where your queen was captured and the opponent kept theirs.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s} a queen down',
  },
  {
    key: 'yahtzee_bonus_earned',
    label: 'Yahtzee — bonus earned',
    description: 'Games where you earned at least one 100-point Yahtzee bonus.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'earned a Yahtzee bonus in at least {n} game{s}',
  },
  {
    key: 'yahtzee_joker_used',
    label: 'Yahtzee — Joker scored',
    description: 'Games where you scored a Yahtzee under the Joker rule.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'used the Joker rule in at least {n} game{s}',
  },
] as const

/**
 * Set-valued measures, addressable by `{ type: 'distinct', key: <key> }`. Backed by
 * `player_distinct`, where the primary key does the deduping and `count(*)` is the value.
 */
export const DISTINCT_SETS: readonly DistinctDef[] = [
  {
    key: 'modes_played',
    label: 'Game modes played',
    description: 'How many different game types this profile has finished.',
    availability: 'universal',
    phrase: 'played at least {n} different game mode{s}',
  },
  {
    key: 'opponents',
    label: 'Opponents faced',
    description: 'Distinct other profiles seated in the same finished game.',
    availability: 'partial',
    phrase: 'faced at least {n} different opponent{s}',
  },
  {
    key: 'rooms',
    label: 'Rooms played in',
    description: 'Distinct game rooms this profile has finished a game in.',
    availability: 'planned',
    phrase: 'played in at least {n} different room{s}',
  },
] as const

const COUNTER_KEYS = new Set(COUNTERS.map((c) => c.key))
const DISTINCT_KEYS = new Set(DISTINCT_SETS.map((d) => d.key))

/** True when a counter key is one the engine knows how to emit or plans to. */
export function isKnownCounter(key: string): boolean {
  return COUNTER_KEYS.has(key)
}

export function isKnownDistinctSet(key: string): boolean {
  return DISTINCT_KEYS.has(key)
}

/**
 * Counters and sets that will actually fire today.
 *
 * The admin UI should offer these first and mark the rest, because a rule referencing a
 * `planned` measure is indistinguishable at runtime from a typo: both read as zero, both
 * produce a trophy nobody can ever earn, and neither raises an error anywhere.
 */
export function liveCounters(): CounterDef[] {
  return COUNTERS.filter((c) => c.availability !== 'planned')
}

export function liveDistinctSets(): DistinctDef[] {
  return DISTINCT_SETS.filter((d) => d.availability !== 'planned')
}
