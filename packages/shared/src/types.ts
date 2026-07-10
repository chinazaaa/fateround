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

export type MobileConfig = {
  minAppVersion: string
  mobileSupportedGames: GameType[]
  maintenanceMessage: string | null
  forceWebFallbackFor: GameType[]
}
