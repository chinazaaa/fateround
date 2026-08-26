export type GameStatus = 'scheduled' | 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type PlayerGender = 'male' | 'female' | 'both'
export type ParticipantGender = 'male' | 'female'
export type ParticipantMode = 'import' | 'joiners' | 'voters'
export type PairVoteMode = 'one_each' | 'any'
export type WyrChoice = 'a' | 'b'
export type PairFlag = 'kiss' | 'kill'
export type PairAssignmentMap = Record<string, PairFlag | null>
export type VoteSlot = 'kiss' | 'marry' | 'kill'

export type GameType =
  | 'smash_marry_kill'
  | 'red_flag_green_flag'
  | 'smash_or_pass'
  | 'would_you_rather'
  | 'never_have_i_ever'
  | 'pick_a_number'
  | 'this_or_that'
  | 'most_likely_to'
  | 'who_said_this'
  | 'hot_seat'
  | 'custom'
  | 'anonymous_messages'
  | 'secret_message'
  | 'bingo'
  | 'codewords'
  | 'trivia'
  | 'two_truths'
  | 'parent_approval'
  | 'monopoly'
  | 'yahtzee'
  | 'whot'
  | 'rummy'
  | 'ludo'
  | 'mahjong'
  | 'i_call_on'
  | 'sudoku'
  | 'tic_tac_toe'
  | 'word_hunt'
  | 'chess'
  | 'describe_it'
  | 'scrabble'
  | 'snake_and_ladder'
  | 'crazy_eights'
  | 'uno'
  | 'checkers'
  | 'checkers_international'
  | 'checkers_nigeria'
  | 'mafia'
  | 'matching_pairs'
  | 'quiplash'
  | 'word_rush'
  | 'quick_draw'
  | 'ayo'
  | 'crossword'
  | 'word_search'
  | 'word_scramble'
  | 'landmine'
  | 'word_grouping'
  | 'wordle_room'
  | 'troll_run'

export interface Game {
  id: string
  title: string
  /** Player-facing content label ("what's this pack about") for CSV/library content games —
   *  e.g. "Maths", "Bible trivia". Distinct from `title` (room name) and `theme` (cosmetic). */
  content_label?: string | null
  game_type: GameType
  status: GameStatus
  current_round_number?: number
  timer_seconds?: number
  max_players?: number | null
  allow_viewers?: boolean | null
  allow_late_players?: boolean | null
  is_public?: boolean | null
  /** Discovery Phase A — bumped on lobby activity; drives the stale-lobby close cron. */
  last_activity_at?: string | null
  /** Discovery Phase C — when a scheduled game is set to open. Null for immediate games. */
  scheduled_at?: string | null
  /** Discovery Phase C — stamped when scheduled → waiting; drives the 10-min unconfirmed-drop cron. */
  opened_at?: string | null
  /** Discovery Phase A — stamped once when the host got the T-13min warning (one bite per game). */
  host_idle_warning_sent_at?: string | null
  /** Discovery Phase A — how the lobby ended ("idle_timeout", null, …). */
  result_reason?: string | null
  /** Whether responses are shown without attribution (poll-family games only). */
  anonymous?: boolean | null
  theme?: string | null
  ayo_variant?: string | null
  participant_mode?: ParticipantMode | string | null
  participant_filter?: string | null
  pair_vote_mode?: PairVoteMode | string | null
  player_questions_enabled?: boolean | null
  player_questions_order?: 'players_first' | 'uploaded_first' | 'mixed' | string | null
  ludo_variant?: string | null
  custom_questions?: unknown[] | null
  gender_based?: boolean | null
  custom_slots?: CustomSlotsConfig | null
  anonymous_messages_trimmed_at?: string | null
  crazy8_action_cards?: boolean | null
  crazy8_jokers?: boolean | null
  crazy8_pick2_stacking?: boolean | null
  whot_pick3_enabled?: boolean | null
  whot_cards_enabled?: boolean | null
  whot_number_calls_enabled?: boolean | null
  whot_pick2_stacking?: boolean | null
  uno_wd4_challenge?: boolean | null
  uno_uno_penalty?: number | null
  uno_wd4_challenge_penalty?: number | null
  uno_zero_seven?: boolean | null
  uno_stacking?: boolean | null
  uno_multi_play?: boolean | null
  uno_multi_play_mode?: string | null
  uno_team_mode?: boolean | null
  uno_jump_in?: boolean | null
  uno_mode?: string | null
  uno_no_mercy_win?: string | null
  uno_series_scoring?: boolean | null
  uno_series_target?: number | null
  uno_series_scores?: Record<string, number> | null
  uno_series_winner_id?: string | null
  describe_it_mode?: string | null
  describe_it_num_teams?: number | null
  word_rush_mode?: string | null
  word_rush_num_teams?: number | null
  word_rush_prompt_mode?: string | null
  word_rush_difficulty?: string | null
  session_started_at?: string | null
  finished_at?: string | null
  game_duration_seconds?: number | null
  rounds_count?: number | null
  replay_pending?: boolean | null
  pending_host_player_id?: string | null
  /** The host's own player row id, so every client can badge the host in the roster
   *  drawer. Non-secret (just a player id, like pending_host_player_id). */
  host_player_id?: string | null
  tournament_id?: string | null
  chess_board_theme?: string | null
  chess_piece_set?: string | null
  scrabble_dictionary_id?: string | null
  scrabble_clock_mode?: 'standard' | 'chess' | null
  scrabble_clock_seconds?: number | null
  operative_timer_seconds?: number | null
  codewords_player_picks?: boolean | null
  codewords_late_join?: boolean | null
  codewords_randomize_teams?: boolean | null
  mafia_doctor_enabled?: boolean | null
  mafia_detective_enabled?: boolean | null
  mafia_aura_seer_enabled?: boolean | null
  mafia_seer_enabled?: boolean | null
  mafia_mafia_seer_enabled?: boolean | null
  mafia_anonymous_votes?: boolean | null
  /** Single Classic/Advanced switch — replaces individually toggling most optional roles.
   *  See resolveMafiaRoundToggles() in src/lib/mafia.ts for exactly what this changes. */
  mafia_advanced_mode?: boolean | null
  mafia_day_seconds?: number | null
  mafia_voting_seconds?: number | null
  monopoly_double_go_salary?: boolean | null
  monopoly_forced_auctions?: boolean | null
  monopoly_auction_timer_seconds?: number | null
  monopoly_no_rent_in_jail?: boolean | null
  monopoly_estate_dividend?: boolean | null
  monopoly_board_size?: 40 | 48 | null
  monopoly_loans_enabled?: boolean | null
  monopoly_loan_interest?: number | null
  monopoly_loan_term_rounds?: number | null
  quick_draw_variant?: QuickDrawVariant | null
  quick_draw_play_mode?: QuickDrawPlayMode | null
  quick_draw_num_teams?: number | null
  mahjong_ruleset?: MahjongRuleset | null
  mahjong_rule_options?: MahjongRuleOptions | null
  landmine_mode?: LandmineMode | null
  landmine_mine_count?: number | null
  landmine_originality_bonus?: boolean | null
  landmine_mine_source?: LandmineMineSource | null
  landmine_elim_seconds?: number | null
  landmine_review?: boolean | null
  landmine_review_seconds?: number | null
  /** Nigerian Draughts — opt-in "Street Rules" (huffing): decline a capture, risk the piece. */
  checkers_nigeria_street_rules?: boolean | null
  question_source?: string | null
  /** Who Said This: 'player' (players submit) or 'deck' (host Platform/Library/CSV deck). */
  wst_quote_source?: string | null
  trivia_category?: TriviaCategory | string | null
  troll_run_rounds?: number | null
  troll_run_time_limit?: number | null
  troll_run_world?: string | null
  created_at?: string | null
  bingo_call_mode?: 'manual' | 'auto' | string | null
  bingo_call_interval_seconds?: number | null
  crossword_theme?: string | null
  crossword_difficulty?: CrosswordDifficulty | string | null
  word_search_theme?: string | null
  word_search_difficulty?: WordSearchDifficulty | string | null
  word_scramble_theme?: string | null
  word_scramble_difficulty?: WordScrambleDifficulty | string | null
  /** Wordle Room — built-in category the race draws from. */
  wordle_room_category?: string | null
  /** Wordle Room — 5/10/15/20 words per race. */
  wordle_room_word_count?: number | null
  /** Wordle Room — optional library/custom pool ({word, hint?}[]) that overrides the category. */
  wordle_room_custom_words?: unknown | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  gender: PlayerGender
  joined_at: string
  spectator?: boolean
  is_eliminated?: boolean
  lives_remaining?: number | null
  eliminated_at?: string | null
  monopoly_token?: string | null
  participant_id?: string | null
  /**
   * Bots-in-room marker (Monopoly + Whot today). See
   * docs/bots-in-room-plan.md — bots are real players rows so every route
   * that touches players works on them without special-casing; this flag
   * only drives UI (🤖 badge, add-bot button visibility, leaderboard gate).
   */
  is_bot?: boolean
}

export type TicTacToeMark = 'X' | 'O'
export type TicTacToeBoardResult = TicTacToeMark | 'draw' | null

export interface TicTacToeSession {
  id: string
  game_id: string
  player_x_id: string
  player_o_id: string
  board: (TicTacToeMark | null)[]
  board_winners: TicTacToeBoardResult[]
  active_board: number | null
  current_turn_mark: TicTacToeMark
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
}

export type CheckersColor = 'r' | 'b'

export interface CheckersSession {
  id: string
  game_id: string
  player_red_id: string
  player_black_id: string
  board: string
  current_turn: CheckersColor
  must_continue_from: string | null
  red_time_ms: number | null
  black_time_ms: number | null
  turn_started_at: string | null
  last_move_from: string | null
  last_move_to: string | null
  result_reason: string | null
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
}

export type Draughts10Variant = 'international' | 'nigeria'

export interface Draughts10Session {
  id: string
  game_id: string
  variant: Draughts10Variant
  player_red_id: string
  player_black_id: string
  /** 100-char board, indexed by row*10 + col. '.' empty, 'r'/'b' man, 'R'/'B' king (flying). */
  board: string
  current_turn: CheckersColor
  must_continue_from: string | null
  /** Captures still required to complete the majority-rule sequence in progress. */
  must_continue_remaining: number | null
  /** Nigeria-only opt-in "street rules" (huffing) room setting. */
  huffing_enabled: boolean
  /**
   * Squares of the mover's own pieces that had a capture available but went unplayed
   * (Street Rules only) — the opponent may "huff" one of these instead of moving.
   */
  huffable_squares: string[]
  red_time_ms: number | null
  black_time_ms: number | null
  turn_started_at: string | null
  last_move_from: string | null
  last_move_to: string | null
  result_reason: string | null
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
}

export type ChessColor = 'w' | 'b'

export interface ChessSession {
  id: string
  game_id: string
  player_white_id: string
  player_black_id: string
  fen: string
  pgn: string
  current_turn: ChessColor
  white_time_ms: number | null
  black_time_ms: number | null
  turn_started_at: string | null
  last_move_from: string | null
  last_move_to: string | null
  in_check: boolean
  status: 'active' | 'finished'
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type AyoSide = 'a' | 'b'
export type AyoVariant = 'traditional' | 'oware'

export interface AyoSession {
  id: string
  game_id: string
  player_a_id: string
  player_b_id: string
  pits: number[]
  captured_a: number
  captured_b: number
  houses_a: number
  houses_b: number
  match_round: number
  a_row_size: number
  b_row_size: number
  current_turn: AyoSide
  a_win_streak: number
  b_win_streak: number
  a_time_ms: number | null
  b_time_ms: number | null
  turn_started_at: string | null
  last_pit: number | null
  status: 'active' | 'finished'
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
}

export interface BingoCard {
  id: string
  game_id: string
  player_id: string
  cells: number[]
  marked_indices: number[]
}

export interface BingoCalledNumber {
  id: string
  game_id: string
  number: number
}

export type TriviaCategory =
  | 'general'
  | 'tech'
  | 'art'
  | 'food'
  | 'geography'
  | 'history'
  | 'language'
  | 'literature'
  | 'math'
  | 'movies'
  | 'music'
  | 'nature'
  | 'pop_culture'
  | 'science'
  | 'sports'
  | 'technology'
  | 'world_culture'

export interface TriviaMetadata {
  question: string
  choices: string[]
  correct_index: number
  category: TriviaCategory
}

export interface AnimeMetadata {
  choices: string[]
  correct_character: string
}

export interface Participant {
  id: string
  game_id: string
  name: string
  gender: ParticipantGender
  photo_url: string | null
  description: string | null
  display_order: number
  in_mlt_poll?: boolean | null
  submitted_by_player_id?: string | null
}

export interface Round {
  id: string
  game_id: string
  round_number: number
  participant_ids?: string[]
  wyr_option_a?: string | null
  wyr_option_b?: string | null
  mlt_question?: string | null
  submitter_player_id?: string | null
  quote_text?: string | null
  quote_author_participant_id?: string | null
  quote_submitted_at?: string | null
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
  anime_metadata?: AnimeMetadata | null
  trivia_metadata?: TriviaMetadata | null
  memory_match_metadata?: MatchingPairsMetadata | null
  landmine_metadata?: LandmineMetadata | null
  sudoku_metadata?: SudokuMetadata | null
  ttl_metadata?: TtlMetadata | null
  quiplash_metadata?: QuiplashMetadata | null
  word_hunt_metadata?: WordHuntMetadata | null
  npat_metadata?: NpatMetadata | null
  crossword_metadata?: CrosswordMetadata | null
  word_search_metadata?: WordSearchMetadata | null
  word_scramble_metadata?: WordScrambleMetadata | null
}

export interface VoteAssignment {
  kiss: string | null
  marry: string | null
  kill: string | null
}

export interface Vote {
  id: string
  player_id: string
  round_id: string
  game_id: string
  kiss_participant_id: string | null
  marry_participant_id: string | null
  kill_participant_id: string | null
  pair_assignments: Record<string, PairFlag> | null
  wyr_choice: WyrChoice | null
  target_player_id: string | null
  target_participant_id: string | null
  anime_choice?: string | null
  picked_number?: number | null
  /** Who Said This speed scoring: how quickly the answer came in, and the points it earned. */
  response_ms?: number | null
  points?: number | null
  created_at: string
}

export interface TriviaAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  choice_index: number
  is_correct: boolean
  points: number
  response_ms: number
}

export type YahtzeeCategory =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'three_kind'
  | 'four_kind'
  | 'full_house'
  | 'small_straight'
  | 'large_straight'
  | 'yahtzee'
  | 'chance'

export type YahtzeePhase = 'rolling' | 'finished'
export type YahtzeeCategoryPoints = Record<YahtzeeCategory, number | null>

export interface YahtzeeSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: YahtzeePhase
  dice: number[]
  held: boolean[]
  rolls_remaining: number
  rolls_this_turn: number
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
}

export interface YahtzeePlayerScore {
  id: string
  game_id: string
  player_id: string
  scores: { categories: YahtzeeCategoryPoints; bonusYahtzees?: number; jokerUsed?: boolean }
  player_order: number
}

export type MatchingPairsGridSize = 8 | 16

export interface MatchingPairEntry {
  icon: string
  color: string
  pairIndex: number
}

export interface MatchingPairsPlayerBoard {
  playerId: string
  cardOrder: number[]
}

export interface MatchingPairsMetadata {
  gridSizePairs: MatchingPairsGridSize
  pairs: MatchingPairEntry[]
  playerBoards: MatchingPairsPlayerBoard[]
  seed: number
}

export interface MatchingPairsSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  pair_index: number
  is_match: boolean
  streak_at_time: number
  streak_bonus: number
  points_after: number
  submitted_at: string
}

export interface MatchingPairsProgress {
  id: string
  game_id: string
  round_id: string
  player_id: string
  pairs_matched: number
  wrong_attempts: number
  finished: boolean
  finish_rank: number | null
}

export interface SudokuMetadata {
  puzzle: number[][]
}

export interface SudokuSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  cell_row: number | null
  cell_col: number | null
  submitted_value: number | null
  is_correct: boolean
  points_awarded: number
  submitted_at?: string | null
}

export type CrosswordDirection = 'across' | 'down'
export type CrosswordDifficulty = 'easy' | 'medium' | 'hard'

/** A single clue: where its first letter sits, which way it runs, its length + text. */
export interface CrosswordClue {
  number: number
  direction: CrosswordDirection
  row: number
  col: number
  length: number
  clue: string
}

/**
 * Client-readable puzzle description stored on `rounds.crossword_metadata`. It carries
 * everything needed to render and play the grid EXCEPT the answer letters.
 */
export interface CrosswordMetadata {
  size: number
  /** true = black / unused cell; false = a fillable cell. */
  blocked: boolean[][]
  /** Clue number shown in a cell, or 0 for none. */
  numbers: number[][]
  clues: CrosswordClue[]
  theme?: string
  difficulty?: CrosswordDifficulty
}

export interface CrosswordSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  cell_row: number
  cell_col: number
  submitted_letter: string
  is_correct: boolean
  via_hint: boolean
  submitted_at: string
}

// ── Word Search ──────────────────────────────────────────────────────────────

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard'

/** The 8 compass directions a word can run. Difficulty picks a subset. */
export type WordSearchDirection = 'E' | 'W' | 'S' | 'N' | 'SE' | 'SW' | 'NE' | 'NW'

/**
 * Client-readable puzzle description stored on `rounds.word_search_metadata`. The letter
 * grid is fully public (that is the game). What stays server-side is where each word sits.
 */
export interface WordSearchMetadata {
  size: number
  /** The full letter grid, row-major, all cells filled. */
  grid: string[][]
  /** The word list to hunt for (uppercased, A–Z). */
  words: string[]
  /** Directions words may run in this puzzle (from the difficulty). */
  directions: WordSearchDirection[]
  theme?: string
  difficulty?: WordSearchDifficulty
}

/** Where a planted word starts and which way it runs (server-side solution). */
export interface WordSearchPlacement {
  word: string
  row: number
  col: number
  direction: WordSearchDirection
}

export type WordScrambleDifficulty = 'easy' | 'medium' | 'hard'

/** Client-readable Word Scramble data (rounds.word_scramble_metadata). Answers stay server-side. */
export interface WordScrambleMetadata {
  scrambles: string[]
  count: number
  theme?: string
  difficulty?: WordScrambleDifficulty
  hints?: string[]
}

export interface WordSearchFound {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  start_row: number
  start_col: number
  end_row: number
  end_col: number
  via_hint: boolean
  found_at: string
}

export type SnakeLadderColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
export type SnakeLadderPhase = 'roll' | 'finished'

export interface SnakeLadderSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: SnakeLadderPhase
  last_roll: number | null
  last_from: number | null
  last_to: number | null
  last_event: string | null
  last_player_id: string | null
  consecutive_sixes: number
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
}

export interface SnakeLadderPlayerState {
  id: string
  game_id: string
  player_id: string
  color: SnakeLadderColor
  position: number
  player_order: number
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue'
export type LudoPieceZone = 'base' | 'track' | 'home' | 'finished'
export type LudoPhase = 'roll' | 'move' | 'finished'
export type LudoVariant = 'modern' | 'traditional'

export interface LudoDiceRoll {
  d1: number
  d2: number
  total: number
  doubles: boolean
}

export interface LudoPiece {
  id: number
  zone: LudoPieceZone
  pos: number
}

export interface LudoSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: LudoPhase
  last_dice: LudoDiceRoll | null
  remaining_dice: number[] | null
  consecutive_sixes: number
  extra_turn: boolean
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
}

export interface LudoPlayerState {
  id: string
  game_id: string
  player_id: string
  color: LudoColor
  pieces: LudoPiece[]
  player_order: number
}

export type CrazyEightsSuit = 'spades' | 'clubs' | 'hearts' | 'diamonds' | 'joker'
export type CrazyEightsCalledSuit = 'spades' | 'clubs' | 'hearts' | 'diamonds'
export type CrazyEightsPhase = 'playing' | 'choose_suit' | 'finished'

export interface CrazyEightsCard {
  id: string
  suit: CrazyEightsSuit
  rank: number
}

export interface CrazyEightsSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  direction: number
  phase: CrazyEightsPhase
  /**
   * REDACTED from clients: anon/authenticated hold no SELECT on this column, because the ordered
   * deck plus your own hand reveals every opponent's hand (2 players) or every future draw (N).
   * Only service-role reads (src/lib/crazy-eights.ts) see it — hence optional. Clients use
   * `draw_count`.
   */
  draw_pile?: CrazyEightsCard[]
  /** REDACTED from clients alongside `draw_pile` — see above. Clients use `discard_count`. */
  discard_pile?: CrazyEightsCard[]
  /** Public size of `draw_pile`. Generated stored column; counts leak no order or identity. */
  draw_count?: number
  /** Public size of `discard_pile`. Generated stored column. */
  discard_count?: number
  top_card: CrazyEightsCard | null
  required_suit: CrazyEightsCalledSuit | null
  pick_two_stack: number
  joker_penalty: number
  status_message: string | null
  winner_player_id: string | null
  finish_order: string[]
  turn_deadline_at: string | null
  created_at: string
  /** Bumped on every write. The realtime delta fast-path orders rows by it, so a row that
   *  arrives out of order can be dropped instead of regressing the board. */
  updated_at: string
}

export interface CrazyEightsPlayerHand {
  id: string
  game_id: string
  player_id: string
  /**
   * `null` means REDACTED (another player's hand) — deliberately not `[]`, since an empty
   * array is meaningful state ("this player is out"). Use `card_count` for anyone but the
   * local player. See src/lib/hand-redaction.ts.
   */
  cards: CrazyEightsCard[] | null
  /** How many cards the player holds. Public information; survives redaction. */
  card_count?: number
  player_order: number
}

export type WhotShape = 'circle' | 'cross' | 'triangle' | 'square' | 'star' | 'whot'
export type WhotPhase = 'playing' | 'choose_whot' | 'finished'

export interface WhotCard {
  id: string
  shape: WhotShape
  number: number
}

export interface WhotSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: WhotPhase
  draw_pile: WhotCard[]
  discard_pile: WhotCard[]
  top_card: WhotCard | null
  required_shape: WhotShape | null
  required_number: number | null
  pick_two_stack: number
  pick_five_stack: number
  status_message: string | null
  winner_player_id: string | null
  finish_order: string[]
  reshuffle_count: number
  turn_deadline_at: string | null
  created_at: string
  /** Bumped on every write. The realtime delta fast-path orders rows by it, so a row that
   *  arrives out of order can be dropped instead of regressing the board. */
  updated_at: string
}

export interface WhotPlayerHand {
  id: string
  game_id: string
  player_id: string
  /**
   * `null` means REDACTED (another player's hand) — deliberately not `[]`, since an empty
   * array is meaningful state ("this player is out"). Use `card_count` for anyone but the
   * local player. See src/lib/hand-redaction.ts.
   */
  cards: WhotCard[] | null
  /** How many cards the player holds. Public information; survives redaction. */
  card_count?: number
  player_order: number
}

// ── UNO ──────────────────────────────────────────────────────────────────────
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'
export type UnoCardColor = UnoColor | 'wild'

/**
 * What a card does. Number cards carry `value` 0–9; everything else is an action.
 * The High-Stakes-only kinds (`wild_reverse_draw4`, `draw6`, `draw10`, `discard_all`,
 * `skip_everyone`, `wild_color_roulette`) only appear in a No Mercy deck — mobile
 * consumers (UnoCardFace glyph mapping, etc.) already reference them by name so
 * they must live in the shared type alongside the Classic ones.
 */
export type UnoCardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4'
  | 'wild_reverse_draw4'
  | 'draw6'
  | 'draw10'
  | 'discard_all'
  | 'skip_everyone'
  | 'wild_color_roulette'

/**
 * Phase-1 (this port) only reaches `playing` / `choose_color` / `challenge_window` / `finished`.
 * `swap_target` (0-7 rule), `team_leave_decision` (Team-Up, Phase 2) and `color_roulette`
 * (No Mercy Wild Colour Roulette reveal window) are carried in the shared type for parity
 * with web's session shape.
 */
export type UnoPhase =
  | 'playing'
  | 'choose_color'
  | 'challenge_window'
  | 'swap_target'
  | 'team_leave_decision'
  | 'color_roulette'
  | 'finished'

export interface UnoCard {
  id: string
  color: UnoCardColor
  kind: UnoCardKind
  /** 0–9 for number cards; omitted for action / wild cards. */
  value?: number
}

export interface UnoSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  /** 1 = forward through turn_order, -1 = reversed (Reverse flips it). */
  direction: number
  phase: UnoPhase
  draw_pile: UnoCard[]
  discard_pile: UnoCard[]
  top_card: UnoCard | null
  /** Colour demanded by a played Wild / Wild Draw Four. */
  required_color: UnoColor | null
  /** Pending forced draw the current player must take (Draw Two / Draw Four target). */
  draw_penalty: number
  /** Which card can stack onto the pending penalty; null = must draw it. Classic tracks
   *  same-kind stacking ('draw2' | 'wild_draw4'); No Mercy adds value-based cross-kind
   *  chains via the extra kinds. */
  draw_penalty_kind: 'draw2' | 'wild_draw4' | 'draw6' | 'draw10' | 'wild_reverse_draw4' | null
  /** Set to the card the current player just drew while they may still play it or keep it (pass). */
  drawn_card_id: string | null
  last_play_cards?: UnoCard[] | null
  /** Who played the current top card (for High Stakes knockout / stack attribution). */
  last_play_player_id?: string | null
  /** During `choose_color`, which wild is being coloured. In No Mercy this also carries
   *  the extra wild kinds — including `wild_color_roulette` which enters `color_roulette`
   *  phase instead of `choose_color`. */
  pending_wild: 'wild' | 'wild_draw4' | 'wild_reverse_draw4' | 'draw6' | 'draw10' | 'wild_color_roulette' | null
  /** Colour in effect immediately before a Wild Draw Four (for challenge reveal). */
  challenge_prev_color: UnoColor | null
  /** Who played the Wild Draw Four currently in `challenge_window`. */
  wd4_player_id: string | null
  /** Player who dropped to one card and still owes an "UNO" call. */
  uno_pending_player: string | null
  /** Whether `uno_pending_player` has satisfied their UNO call. */
  uno_called: boolean
  status_message: string | null
  winner_player_id: string | null
  /** Player ids in the order they emptied their hands. Drives final placement. */
  finish_order: string[]
  /** Team-Up (Phase 2, unwired on mobile): players who left mid-round. */
  left_player_ids?: string[]
  /** Team-Up (Phase 2, unwired on mobile). */
  team_decider_id?: string | null
  /** No Mercy: players knocked out by the 25-card Mercy rule this round. */
  eliminated_player_ids?: string[]
  /** No Mercy: who chose the colour for a Wild Colour Roulette (they draw until match). */
  color_roulette_player_id?: string | null
  /** No Mercy: reveals so far in the current Colour Roulette event (NULL when none in
   *  progress). Trophies for Roulette Master (>=5) / Executioner (>=8) key off this. */
  color_roulette_reveals?: number | null
  /** No Mercy — running length of the current Draw-stack chain (see engine notes). */
  draw_stack_chain?: number
  turn_deadline_at: string | null
  created_at?: string
  updated_at?: string
}

export interface UnoPlayerHand {
  id: string
  game_id: string
  player_id: string
  cards: UnoCard[]
  player_order: number
}

export interface TtlMetadata {
  statements: [string, string, string]
  lie_index: number
}

export interface TtlStatement {
  id: string
  game_id: string
  player_id: string
  statement_a: string
  statement_b: string
  statement_c: string
  lie_index: number
}

export interface TtlGuess {
  id: string
  game_id: string
  round_id: string
  player_id: string
  guessed_index: number
  is_correct: boolean
  points: number
}

export type DescribeItPhase = 'turn' | 'break' | 'finished'
export type DescribeItMode = 'team' | 'individual'

export interface DescribeItSession {
  id: string
  game_id: string
  mode: DescribeItMode
  num_teams: number
  total_rounds: number
  turn_seconds: number
  phase: DescribeItPhase
  turn_index: number
  current_round: number
  active_team: number
  describer_player_id: string | null
  roster: string[]
  /**
   * The secret word. NOT present on a client-side session — `current_word` is revoked from
   * anon/authenticated by migration 20260807130000, and DESCRIBE_IT_SESSION_SELECT no longer
   * asks for it. The describer fetches it via POST /api/describe-it/my-word.
   */
  current_word?: string | null
  current_clue: string | null
  current_clues: string[]
  /**
   * A SHADOW COPY of the secret — every write that sets `current_word` appends it here, so the
   * last element IS the current word. Revoked from anon with `current_word`, so it is absent
   * client-side. Use `word_seq` for the per-word counter.
   */
  used_words?: string[]
  /** Public per-word counter (`cardinality(used_words)`) — ticks once per word rotation. */
  word_seq?: number
  status: 'active' | 'finished'
  status_message: string | null
  turn_deadline_at: string | null
  break_deadline_at: string | null
}

export interface DescribeItPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  score: number
}

export interface DescribeItWord {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  describer_player_id: string | null
  word: string
  clue: string | null
  status: 'guessed' | 'skipped'
  guesser_player_id: string | null
}

export interface DescribeItGuess {
  id: string
  game_id: string
  turn_index: number
  player_id: string
  team: number
  text: string
  correct: boolean
  points: number
  created_at: string
}

export type NpatPhase = 'letter_pick' | 'writing' | 'marking' | 'host_review' | 'reveal'
export type NpatCategory = 'name' | 'animal' | 'place' | 'thing' | 'food'

export interface NpatMetadata {
  letter: string | null
  phase: NpatPhase
  phase_started_at: string | null
  reviewer_assignments: Record<string, string>
  scores_computed?: boolean
  used_letters: string[]
  caller_order: string[]
  caller_index: number
  host_overrides?: Record<string, Partial<Record<NpatCategory, boolean>>>
  disputes?: Array<{ challenger_id: string; target_player_id: string; category: NpatCategory }>
}

export interface NpatAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  name: string
  animal: string
  place: string
  thing: string
  food: string
  submitted_at: string | null
  score_name: number | null
  score_animal: number | null
  score_place: number | null
  score_thing: number | null
  score_food: number | null
}

export interface NpatMark {
  id: string
  game_id: string
  round_id: string
  marker_player_id: string
  target_player_id: string
  valid_name: boolean
  valid_animal: boolean
  valid_place: boolean
  valid_thing: boolean
  valid_food: boolean
  marked_at: string | null
}

// Landmine — single-answer variant of I Call On with a secret mine + two scoring modes.
export type LandminePhase = 'category_pick' | 'writing' | 'marking' | 'review' | 'reveal'
export type LandmineMode = 'zero_points' | 'elimination'
export type LandmineMineSource = 'system' | 'manual'
export type LandmineOutcome = 'valid' | 'original' | 'void' | 'mine' | 'empty' | 'setter'

export interface LandmineMetadata {
  phase: LandminePhase
  phase_started_at: string | null
  category: string | null
  caller_order: string[]
  caller_index: number
  reviewer_assignments: Record<string, string>
  revealed_mines?: string[]
  mine_count: number
  scores_computed?: boolean
}

export interface LandmineAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  answer: string
  submitted_at: string | null
  points: number | null
  outcome: LandmineOutcome | null
  mine_hit: boolean | null
  is_original: boolean | null
}

export interface LandmineMark {
  id: string
  game_id: string
  round_id: string
  marker_player_id: string
  target_player_id: string
  valid: boolean
  marked_at: string | null
}

export interface WordHuntMetadata {
  grid: string[][]
  valid_words?: string[]
}

export interface WordHuntSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  path: number[]
  points_awarded: number
  submitted_at: string
}

export type WordRushPhase = 'playing' | 'awaiting_prompt' | 'intermission' | 'finished'
export type WordRushMode = 'team' | 'individual'
export type WordRushPromptMode = 'automatic' | 'manual'
export type WordRushDifficulty = 'standard' | 'hard'

export interface WordRushSession {
  id: string
  game_id: string
  mode: WordRushMode
  prompt_mode: WordRushPromptMode
  difficulty: WordRushDifficulty
  min_word_length: number
  num_teams: number
  total_rounds: number
  turn_seconds: number
  phase: WordRushPhase
  turn_index: number
  current_round: number
  active_team: number
  prompt_setter_player_id: string | null
  roster: string[]
  start_letter: string | null
  end_letter: string | null
  prompt_index: number
  used_pairs: string[]
  turn_deadline_at: string | null
  intermission_deadline_at: string | null
  status: 'active' | 'finished'
  status_message: string | null
}

export interface WordRushPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  score: number
}

export interface WordRushAnswer {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  team_turn_index: number | null
  prompt_index: number
  start_letter: string
  end_letter: string
  player_id: string
  text: string
  correct: boolean
}

export interface QuiplashMetadata {
  prompt: string
}

export type QuiplashPhase = 'writing' | 'voting' | 'reveal' | 'finished'

export interface QuiplashSession {
  id: string
  game_id: string
  phase: QuiplashPhase
  battle_index: number
  active_battle_id: string | null
  turn_deadline_at: string | null
}

export interface QuiplashAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  text: string
  is_bye: boolean
  submitted_at: string
}

export interface QuiplashBattle {
  id: string
  game_id: string
  round_id: string
  battle_number: number
  answer_a_id: string
  answer_b_id: string
  winner_answer_id: string | null
  points_awarded: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
}

export interface QuiplashVote {
  id: string
  game_id: string
  battle_id: string | null
  round_id: string | null
  player_id: string
  chosen_answer_id: string
  voted_at: string
}

export interface ScrabbleBoardCell {
  letter: string
  isBlank: boolean
}

export type ScrabbleBoard = (ScrabbleBoardCell | null)[][]

export interface ScrabblePlacedTile {
  row: number
  col: number
  letter: string
  isBlank: boolean
}

export interface ScrabbleLastMove {
  player_id: string
  kind: 'play' | 'exchange' | 'pass'
  words: string[]
  score: number
  tiles: { row: number; col: number }[]
}

export interface ScrabbleSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  board: ScrabbleBoard
  bag: string[]
  phase: 'playing' | 'finished'
  consecutive_passes: number
  last_move: ScrabbleLastMove | null
  winner_player_id: string | null
  is_tie: boolean
  status_message: string | null
  turn_deadline_at: string | null
  clock_mode: 'standard' | 'chess'
  turn_started_at: string | null
  created_at: string
  updated_at: string
}

export interface ScrabblePlayerState {
  id: string
  game_id: string
  player_id: string
  rack: string[]
  score: number
  player_order: number
  clock_ms_remaining: number | null
  timed_out: boolean
  created_at: string
}

export type CodewordsCellType = 'red' | 'blue' | 'neutral' | 'assassin'
export type CodewordsTeam = 'red' | 'blue'
export type CodewordsRole = 'spymaster' | 'operative'

export interface CodewordsBoard {
  id: string
  game_id: string
  words: string[]
  /**
   * Word → team assignment. SECRET while the game is live: only the host and the two
   * spymasters receive the real array from /api/codewords/board. Everyone else gets a MASKED
   * copy — the true type at revealed indices, `null` at unrevealed ones — which is all an
   * operative's UI needs (audit finding H2). Mirrors the web type in src/types/index.ts.
   */
  key: (CodewordsCellType | null)[]
  /**
   * How many cells belong to each type. Not secret (the split is fixed by the ruleset and is
   * already on screen), but it CANNOT be derived from a masked key — counting a masked key
   * yields "revealed reds" as the red total, i.e. a scoreboard that says both teams have
   * already found everything. The API sends it explicitly for exactly that reason.
   */
  key_totals?: Partial<Record<CodewordsCellType, number>>
  starting_team: CodewordsTeam
  revealed_indices: number[]
  current_turn: CodewordsTeam
  guesses_remaining: number | null
  current_clue_word: string | null
  current_clue_number: number | null
  winner: CodewordsTeam | null
  assassin_team: CodewordsTeam | null
  spymaster_timer_seconds: number
  operative_timer_seconds: number
  turn_phase: 'clue' | 'guess'
  turn_deadline_at: string | null
  created_at: string
}

export interface CodewordsPlayerRole {
  id: string
  game_id: string
  player_id: string
  team: CodewordsTeam
  role: CodewordsRole
  created_at: string
}

export interface CodewordsGuess {
  id: string
  game_id: string
  board_id: string
  player_id: string
  cell_index: number
  word: string
  cell_type: CodewordsCellType
  clue_word: string | null
  clue_number: number | null
  team: CodewordsTeam
  created_at: string
}

export interface CodewordsMessage {
  id: string
  game_id: string
  player_id: string
  team: CodewordsTeam
  text: string
  created_at: string
}

export type MafiaRole =
  | 'villager'
  | 'doctor'
  | 'detective'
  | 'bodyguard'
  | 'mayor'
  | 'vigilante'
  | 'tracker'
  | 'mafia'
  | 'alpha_wolf'
  | 'wolf_cub'
  | 'framer'
  | 'jester'
  | 'serial_killer'
  | 'arsonist'
  | 'cupid'
  | 'cursed_villager'
  | 'medium'
  | 'priest'
  | 'witch'
  | 'little_girl'
  | 'trapper'
  | 'aura_seer'
  | 'seer'
  | 'mafia_seer'
  | 'red_lady'
export type MafiaTeam = 'village' | 'mafia' | 'jester' | 'serial_killer' | 'arsonist'
export type MafiaDeathCause =
  | 'mafia_kill'
  | 'village_vote'
  | 'serial_kill'
  | 'arson'
  | 'vigilante_kill'
  | 'witch_kill'
  | 'trap_kill'
  | 'red_lady_death'
export type MafiaPhase = 'role_reveal' | 'night' | 'day_report' | 'day' | 'voting' | 'elimination' | 'game_over'

export interface MafiaPublicPlayer {
  id: string
  seatNumber: number
  name: string
  isAlive: boolean
  deathDay: number | null
  deathCause: MafiaDeathCause | null
  role?: MafiaRole // Only revealed on death or game over
  revivedByMedium?: boolean
}

export interface MafiaChatMessage {
  id: string
  game_id: string
  sender_player_id: string
  sender_name: string
  message: string
  created_at: string
}

export interface MafiaMyState {
  role: MafiaRole
  team: MafiaTeam
  nightActionSubmitted: boolean
  dayVoteSubmitted: boolean
  auraSeerResult: { targetName: string; alignment: 'good' | 'evil' | 'unknown' } | null
  detectiveTeamCheckResult?: { targetAName: string; targetBName: string; sameTeam: boolean } | null
  mafiaTeammates: string[] // Only for mafia team members (mafia/alpha_wolf/wolf_cub/framer)
  /** Same set as mafiaTeammates but by player id — lets the roster grid mark each teammate's
   *  tile with the shared mafia symbol and reveal their role, without a separate list panel. */
  mafiaTeammateIds: string[]
  /** Each teammate's actual role (Mafia/Alpha Wolf/Wolf Cub/Framer) keyed by player id — the
   *  crew sees exactly what each other plays, not just "they're mafia too". */
  mafiaTeammateRoles: Record<string, MafiaRole>
  /** Every role the Mafia Seer has revealed so far, keyed by player id — only ever
   *  populated for mafia-team members (never sent to villagers), so the crew keeps a
   *  running roster of everyone their seer has checked, not just the latest one. */
  mafiaSeerRevealedRoles?: Record<string, MafiaRole>
  mafiaChatMessages?: MafiaChatMessage[]
  mafiaTeammateNightTargets?: Record<string, string | null>
  trackerResult?: { targetName: string; visitedName: string | null } | null
  bodyguardLastOutcome?: 'saved' | 'absorbed' | 'sacrificed' | 'no_attack' | null
  doctorLastOutcome?: 'saved' | 'no_attack' | null
  vigilanteShotsRemaining?: number
  vigilanteRevealRemaining?: number
  /** The role the Vigilante revealed this day (only they see it). */
  vigilanteRevealResult?: { targetName: string; role: MafiaRole } | null
  mediumReviveRemaining?: number
  mediumGhostChat?: MafiaChatMessage[]
  priestHolyWaterRemaining?: number
  witchHealRemaining?: number
  witchKillRemaining?: number
  trapperTrappedNames?: string[]
  /** Village Seer's full-role reveal of their last target. */
  seerResult?: { targetName: string; role: MafiaRole } | null
  /** Mafia Seer's full-role reveal of their last target (before resigning). */
  mafiaSeerResult?: { targetName: string; role: MafiaRole } | null
  framerLastTargetName?: string | null
  cupidLinkedNames?: [string, string] | null
  isLover?: boolean
  loverPartnerName?: string | null
  /** The two Lovers' player ids — populated only for Cupid and the two Lovers themselves, so
   *  the roster grid can mark their tiles with a heart without exposing it to anyone else. */
  loverIds?: string[]
  wolfCubRevengeTargetName?: string | null
  enabledRoles?: MafiaRole[]
}

export type MonopolyPhase = 'roll' | 'buy' | 'jail' | 'pay_rent' | 'auction' | 'raise_funds' | 'finished'

export interface MonopolyPendingDebt {
  player_id: string
  creditor_player_id: string | null
  amount: number
  reason: string
  debt_type: 'rent' | 'tax' | 'card' | 'jail' | 'other'
  space_index?: number | null
  next_debts?: MonopolyPendingDebt[]
}

export interface MonopolyAuctionState {
  space_index: number
  high_bid: number
  high_bidder_id: string | null
  current_bidder_id: string
  passed: string[]
  eligible: string[]
  initiator_id: string
}

export interface MonopolyLastCardEvent {
  seq: number
  kind: 'chance' | 'community'
  drawn_by_player_id: string
  card_message: string
  effect: string
  amount?: number
  other_player_count?: number
}

export interface MonopolyLoan {
  id: string
  player_id: string
  principal: number
  interest_rate: number
  total_due: number
  amount_repaid: number
  balance_remaining: number
  term_rounds: number
  rounds_remaining: number
  created_at: string
  status: 'active' | 'repaid' | 'defaulted'
}

export interface MonopolyBoard {
  id: string
  game_id: string
  board_size?: 40 | 48
  turn_order: string[]
  current_turn_index: number
  phase: MonopolyPhase
  last_dice: { d1: number; d2: number; total: number; doubles: boolean } | null
  consecutive_doubles: number
  property_owners: Record<string, string>
  property_buildings: Record<string, number>
  mortgaged_properties: Record<string, boolean>
  houses_in_bank: number
  hotels_in_bank: number
  // Server-only. These are the shuffled Chance / Community Chest decks; knowing their order is
  // knowing every upcoming card, so they are NOT in MONOPOLY_BOARD_SELECT and never reach a
  // client. `monopoly.ts` reads them through the service role with `select('*')`. Optional here
  // because a client-fetched row genuinely lacks them — `parseDeck` already returns [] for a
  // non-array, so no read site needs changing.
  chance_deck?: number[]
  community_deck?: number[]
  chance_discard?: number[]
  community_discard?: number[]
  auction_state: MonopolyAuctionState | null
  pending_trade: unknown | null
  pending_debt: MonopolyPendingDebt | null
  pending_space: number | null
  status_message: string | null
  last_card_event: MonopolyLastCardEvent | null
  last_rent_event: unknown | null
  last_cash_event: unknown | null
  last_trade_event: unknown | null
  loans?: MonopolyLoan[]
  turn_deadline_at: string | null
  winner_player_id: string | null
  created_at: string
  updated_at: string
}

export interface MonopolyPlayerState {
  id: string
  game_id: string
  player_id: string
  position: number
  cash: number
  in_jail: boolean
  jail_turns: number
  get_out_of_jail_free: number
  bankrupt: boolean
  passed_go_once: boolean
  player_order: number
  created_at: string
}

export type MahjongSeat = 'east' | 'south' | 'west' | 'north'
export type MahjongPhase = 'draw' | 'discard' | 'claim' | 'finished'
export type MahjongMeldType = 'chow' | 'pung' | 'kong'
export type MahjongClaimType = 'mahjong' | MahjongMeldType
export type MahjongRuleset = 'fate_round' | 'hong_kong' | 'riichi' | 'mcr'

export interface MahjongRuleOptions {
  matchLength?: 'hanchan' | 'east'
  startingScore?: number
  returnScore?: number
  bankruptcyEndsMatch?: boolean
  agariYame?: boolean
  okaEnabled?: boolean
  uma?: number[]
  doubleYakuman?: boolean
  kazoeYakuman?: boolean
  kiriageMangan?: boolean
  openTanyao?: boolean
  redFives?: boolean
  abortiveDraws?: boolean
  nagashiMangan?: boolean
  renhou?: 'off' | 'mangan' | 'yakuman'
  chomboPenalty?: 'mangan' | 'none'
  hongKongMinimumFan?: number
  hongKongLimitFan?: number
  mcrMinimumPoints?: number
  [key: string]: unknown
}

export type MahjongWinningPattern =
  | 'standard'
  | 'seven_pairs'
  | 'thirteen_orphans'
  | 'knitted_straight'
  | 'greater_honors_knitted'
  | 'lesser_honors_knitted'

export interface MahjongScoreLine {
  label: string
  fan: number
  detail?: string
}

export interface MahjongScorePayment {
  player_id: string
  delta: number
  reason?: string
}

export interface MahjongScoreSummary {
  ruleset: MahjongRuleset
  pattern?: MahjongWinningPattern
  fan: number
  yaku_fan?: number
  yakuman?: number
  limit?: string | null
  fu?: number | null
  base_points?: number
  total_points: number
  lines: MahjongScoreLine[]
  payments: MahjongScorePayment[]
  payer_player_id?: string | null
  winner_player_ids?: string[]
  honba?: number
  riichi_sticks?: number
}

export interface MahjongDiscard {
  tile: string
  player_id: string
  discard_index: number
}

export interface MahjongLastDiscard {
  tile: string
  player_id: string
  discard_index: number
}

export interface MahjongMeld {
  type: MahjongMeldType
  tiles: string[]
  claimed_tile?: string | null
  from_player_id?: string | null
  concealed?: boolean
  added?: boolean
}

export interface MahjongSession {
  id: string
  game_id: string
  ruleset: MahjongRuleset
  turn_order: string[]
  dealer_index: number
  current_turn_index: number
  phase: MahjongPhase
  wall: string[]
  dead_wall?: string[]
  dora_indicators?: string[]
  discard_pile: MahjongDiscard[]
  last_discard: MahjongLastDiscard | null
  claim_passes: string[]
  status_message: string | null
  winner_player_id: string | null
  winner_player_ids?: string[] | null
  winning_tile: string | null
  win_type: 'self_draw' | 'discard' | null
  scores?: Record<string, number> | null
  score_summary?: MahjongScoreSummary | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface MahjongPlayerState {
  id: string
  game_id: string
  player_id: string
  seat: MahjongSeat
  hand: string[]
  hand_count?: number
  last_drawn_tile?: string | null
  flowers?: string[]
  riichi_declared?: boolean
  temporary_furiten?: boolean
  permanent_furiten?: boolean
  melds: MahjongMeld[]
  discarded: string[]
  player_order: number
  created_at: string
}

export type QuickDrawVariant = 'lie' | 'guess'
export type QuickDrawPlayMode = 'team' | 'individual'
export type QuickDrawGuessPhase = 'turn' | 'break' | 'finished'

export interface QuickDrawStroke {
  color: string
  width: number
  points: [number, number][]
  tool?: 'pen' | 'eraser'
}

export interface QuickDrawDrawingStrokeData {
  width: number
  height: number
  strokes: QuickDrawStroke[]
}

export interface QuickDrawGuessSession {
  id: string
  game_id: string
  mode: QuickDrawPlayMode
  num_teams: number
  total_rounds: number
  turn_seconds: number
  roster: string[]
  phase: QuickDrawGuessPhase
  turn_index: number
  current_round: number
  active_team: number
  drawer_player_id: string | null
  /**
   * The secret prompt. NOT present on a client-side session — `current_word` is revoked from
   * anon/authenticated by migration 20260807140000, and QUICK_DRAW_GUESS_SESSION_SELECT no longer
   * asks for it. The drawer gets it back via POST /api/quick-draw/my-word.
   */
  current_word?: string | null
  current_stroke_data: QuickDrawDrawingStrokeData
  /**
   * Also secret: its last entry IS the current word, so it is revoked alongside `current_word`
   * and absent from client reads. Use `word_seq` when all you need is "the word changed".
   */
  used_words?: string[]
  /**
   * Public per-word counter — `cardinality(used_words)`, a generated column. Ticks once per word,
   * including the mid-turn rotations (correct guess, skip) that leave `turn_index` untouched.
   */
  word_seq?: number
  turn_deadline_at: string | null
  break_deadline_at: string | null
  status: 'active' | 'finished'
  status_message: string | null
  created_at: string
  updated_at: string
}

export interface QuickDrawGuessPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  score: number
  created_at: string
}

export interface QuickDrawGuessWord {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  drawer_player_id: string | null
  word: string
  status: 'guessed' | 'skipped'
  guesser_player_id: string | null
  created_at: string
}

export interface QuickDrawGuessGuess {
  id: string
  game_id: string
  turn_index: number
  player_id: string
  team: number
  text: string
  correct: boolean
  points: number
  created_at: string
}

export type QuickDrawLiePhase = 'drawing' | 'titling' | 'voting' | 'reveal' | 'finished'

export interface QuickDrawSession {
  id: string
  game_id: string
  phase: QuickDrawLiePhase
  drawing_index: number
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface QuickDrawAssignment {
  id: string
  game_id: string
  round_id: string
  player_id: string
  prompt: string
  created_at: string
}

export interface QuickDrawDrawing {
  id: string
  game_id: string
  round_id: string
  player_id: string
  stroke_data: QuickDrawDrawingStrokeData
  submitted_at: string
}

export interface QuickDrawTitle {
  id: string
  game_id: string
  drawing_id: string
  player_id: string | null
  text: string
  is_real: boolean
  submitted_at: string
}

export interface QuickDrawVote {
  id: string
  game_id: string
  drawing_id: string
  player_id: string
  chosen_title_id: string
  voted_at: string
}

export type MobileConfig = {
  minAppVersion: string
  mobileSupportedGames: GameType[]
  maintenanceMessage: string | null
  forceWebFallbackFor: GameType[]
}

export interface CustomSlot {
  key: string
  label: string
  emoji: string
  color: string
}

export interface CustomSlotsConfig {
  slots: CustomSlot[]
  title: string
  gender_based?: boolean
}

export interface AnonymousMessage {
  id: string
  game_id: string
  player_id: string
  player_name?: string
  text: string
  created_at: string
  reply_to_id?: string | null
  reply_to_text?: string | null
  message_type?: 'text' | 'gif'
  media_url?: string | null
}

export interface AnonymousRoomBan {
  id: string
  game_id: string
  player_id: string
  banned_until: string
  created_at: string
}

export type TrollRunPhase = 'lobby' | 'countdown' | 'racing' | 'scoreboard' | 'finished'

export interface TrollRunSession {
  id: string
  game_id: string
  phase: TrollRunPhase
  current_round: number
  total_rounds: number
  current_world: string
  levels_per_round: number
  round_time_limit: number
  round_started_at: string | null
  turn_deadline_at: string | null
  level_order: string[]
  created_at: string
  updated_at: string
}

export interface TrollRunPlayerState {
  id: string
  game_id: string
  player_id: string
  current_round: number
  current_level_index: number
  deaths: number
  levels_cleared: number
  total_time_ms: number
  round_score: number
  total_score: number
  finish_position: number | null
  round_finished: boolean
  created_at: string
  updated_at: string
}

export interface TrollRunEvent {
  id: string
  game_id: string
  player_id: string
  player_name?: string
  round: number
  level_id: string
  level_name?: string
  event_type: 'death' | 'clear'
  time_ms?: number | null
  created_at: string
}
