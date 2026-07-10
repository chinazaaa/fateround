export type GameStatus = 'waiting' | 'active' | 'finished'
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
  | 'checkers'
  | 'mafia'
  | 'matching_pairs'
  | 'quiplash'
  | 'word_rush'
  | 'quick_draw'
  | 'ayo'

export interface Game {
  id: string
  title: string
  game_type: GameType
  status: GameStatus
  current_round_number?: number
  timer_seconds?: number
  max_players?: number | null
  allow_viewers?: boolean | null
  allow_late_players?: boolean | null
  ayo_variant?: string | null
  participant_mode?: ParticipantMode | string | null
  pair_vote_mode?: PairVoteMode | string | null
  ludo_variant?: string | null
  custom_questions?: unknown[] | null
  crazy8_action_cards?: boolean | null
  crazy8_jokers?: boolean | null
  crazy8_pick2_stacking?: boolean | null
  whot_pick3_enabled?: boolean | null
  whot_cards_enabled?: boolean | null
  whot_number_calls_enabled?: boolean | null
  whot_pick2_stacking?: boolean | null
  describe_it_mode?: string | null
  describe_it_num_teams?: number | null
  word_rush_mode?: string | null
  word_rush_num_teams?: number | null
  word_rush_prompt_mode?: string | null
  word_rush_difficulty?: string | null
  session_started_at?: string | null
  game_duration_seconds?: number | null
  rounds_count?: number | null
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
  mafia_anonymous_votes?: boolean | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  gender: PlayerGender
  joined_at: string
  spectator?: boolean
  is_eliminated?: boolean
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
  a_row_size: number
  b_row_size: number
  current_turn: AyoSide
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
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

export type TriviaCategory = 'general' | 'tech'

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
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
  anime_metadata?: AnimeMetadata | null
  trivia_metadata?: TriviaMetadata | null
  memory_match_metadata?: MatchingPairsMetadata | null
  sudoku_metadata?: SudokuMetadata | null
  ttl_metadata?: TtlMetadata | null
  quiplash_metadata?: QuiplashMetadata | null
  word_hunt_metadata?: WordHuntMetadata | null
  npat_metadata?: NpatMetadata | null
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
  scores: { categories: YahtzeeCategoryPoints }
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
  draw_pile: CrazyEightsCard[]
  discard_pile: CrazyEightsCard[]
  top_card: CrazyEightsCard | null
  required_suit: CrazyEightsCalledSuit | null
  pick_two_stack: number
  joker_penalty: number
  status_message: string | null
  winner_player_id: string | null
  finish_order: string[]
  turn_deadline_at: string | null
}

export interface CrazyEightsPlayerHand {
  id: string
  game_id: string
  player_id: string
  cards: CrazyEightsCard[]
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
  turn_deadline_at: string | null
}

export interface WhotPlayerHand {
  id: string
  game_id: string
  player_id: string
  cards: WhotCard[]
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
  current_word: string | null
  current_clue: string | null
  current_clues: string[]
  used_words?: string[]
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
  key: CodewordsCellType[]
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

export type MafiaRole = 'villager' | 'mafia' | 'doctor' | 'detective'
export type MafiaTeam = 'village' | 'mafia'
export type MafiaPhase = 'role_reveal' | 'night' | 'day_report' | 'day' | 'elimination' | 'game_over'

export interface MafiaPublicPlayer {
  id: string
  name: string
  isAlive: boolean
  deathDay: number | null
  deathCause: 'mafia_kill' | 'village_vote' | null
  role?: MafiaRole
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
  detectiveResult: { targetName: string; alignment: MafiaTeam } | null
  mafiaTeammates: string[]
  mafiaChatMessages?: MafiaChatMessage[]
}

export type MobileConfig = {
  minAppVersion: string
  mobileSupportedGames: GameType[]
  maintenanceMessage: string | null
  forceWebFallbackFor: GameType[]
}
