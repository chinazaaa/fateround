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

export type MobileConfig = {
  minAppVersion: string
  mobileSupportedGames: GameType[]
  maintenanceMessage: string | null
  forceWebFallbackFor: GameType[]
}
