export type GameStatus = 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type AutoSubmitBehavior = 'random' | 'no_answer'
export type ParticipantMode = 'import' | 'joiners' | 'voters'
/** Pair games: `any` = 2 smash OK; `one_each` = must pick one of each option. */
export type PairVoteMode = 'any' | 'one_each'
/** WYR / MLT: built-in pool vs host-uploaded CSV questions, or community library pack. */
export type QuestionSource = 'platform' | 'custom' | 'library'
/** How player-submitted lobby questions are mixed with uploaded/platform questions. */
export type PlayerQuestionsOrder = 'players_first' | 'uploaded_first' | 'mixed'
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
  | 'i_call_on'
  | 'sudoku'
  | 'tic_tac_toe'
  | 'word_hunt'
  | 'chess'

export type NpatPhase = 'letter_pick' | 'writing' | 'marking' | 'host_review' | 'reveal'
export type NpatCategory = 'name' | 'animal' | 'place' | 'thing' | 'food'

export type NpatHostOverrides = Record<string, Partial<Record<NpatCategory, boolean>>>

export interface NpatDispute {
  challenger_id: string
  target_player_id: string
  category: NpatCategory
}

export interface NpatMetadata {
  letter: string | null
  phase: NpatPhase
  phase_started_at: string | null
  reviewer_assignments: Record<string, string>
  scores_computed?: boolean
  used_letters: string[]
  caller_order: string[]
  caller_index: number
  host_overrides?: NpatHostOverrides
  disputes?: NpatDispute[]
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
export type TriviaCategory = 'tech' | 'general'
export type BingoCallMode = 'manual' | 'auto'
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
  player_name?: string
}
export type ThemeId = 'default' | 'neon' | 'retro' | 'elegant' | 'tropical'
export type WyrChoice = 'a' | 'b'

export type ParticipantGender = 'male' | 'female'
/** Gender selected when joining — `both` means vote on every round. */
export type PlayerGender = 'male' | 'female' | 'both'

export interface CustomSlot {
  key: string
  label: string
  emoji: string
  color: string
}

export interface CustomSlotsConfig {
  slots: CustomSlot[]
  title: string
  /** When true, rounds are same-gender and players vote by gender (KMK-style). Default false. */
  gender_based?: boolean
}

export interface Game {
  id: string
  title: string
  host_token: string
  rounds_count: number
  timer_seconds: number
  /** Codewords — operative guess phase timer. */
  operative_timer_seconds?: number | null
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: AutoSubmitBehavior
  participant_mode: ParticipantMode
  participant_filter: 'all' | 'joined'
  pair_vote_mode: PairVoteMode
  question_source?: QuestionSource
  custom_questions?: unknown[] | null
  /** WYR / MLT / This or That: allow players to submit questions. People poll games: allow name submissions. */
  player_questions_enabled?: boolean
  /** Order to mix player submissions with uploaded/platform questions when the game starts. */
  player_questions_order?: PlayerQuestionsOrder
  game_type: GameType
  theme?: ThemeId
  status: GameStatus
  current_round_number: number
  created_at: string
  /** When the game session ended (status set to finished). */
  finished_at?: string | null
  /** Anonymous room — when the live session started (15 min cap). */
  session_started_at?: string | null
  /** Lobby cap for joiner modes (anonymous 2–20, bingo 2–30, codewords 4–20). */
  max_players?: number | null
  /** When false, players cannot join as spectators after the game starts. */
  allow_viewers?: boolean
  /** When allow_viewers is true: false = watch-only late join; true = late joiners may play. */
  allow_late_players?: boolean
  /** Anonymous room — last time a batch of old messages was trimmed. */
  anonymous_messages_trimmed_at?: string | null
  wst_quote_source?: WstQuoteSource
  custom_slots?: CustomSlotsConfig | null
  /** When true, rounds use same-gender groups and opposite-gender voting. Default true for SMK/pair, false for custom. */
  gender_based?: boolean
  /** Codewords — when false, only the host assigns teams and roles in the lobby. */
  codewords_player_picks?: boolean
  /** Codewords — allow new players to join after the game has started. */
  codewords_late_join?: boolean
  /** Codewords — host picks spymasters only; operatives are shuffled onto teams at start. */
  codewords_randomize_teams?: boolean
  /** Cumulative usage across play-again sessions — unused pool items are prioritized next game. */
  pool_usage?: Record<string, unknown> | null
  /** Trivia — platform pool category when question_source is platform. */
  trivia_category?: TriviaCategory | null
  /** Bingo — manual host calls vs automatic number calling. */
  bingo_call_mode?: BingoCallMode | null
  /** Bingo — seconds between automatic number calls. */
  bingo_call_interval_seconds?: number | null
  /** Monopoly — max active session length in seconds; 0 = unlimited. */
  game_duration_seconds?: number | null
  /** Whot — include Pick 3 (5) cards and penalty stacking. */
  whot_pick3_enabled?: boolean
  /** Whot — include WHOT (20) wild cards in the deck. */
  whot_cards_enabled?: boolean
  /** Whot — allow calling a number when playing WHOT. */
  whot_number_calls_enabled?: boolean
}

export type MonopolyPhase = 'roll' | 'buy' | 'jail' | 'pay_rent' | 'auction' | 'raise_funds' | 'finished'

export interface MonopolyPendingDebt {
  player_id: string
  creditor_player_id: string | null
  amount: number
  reason: string
  debt_type: 'rent' | 'tax' | 'card' | 'jail' | 'other'
  space_index?: number | null
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

export interface MonopolyPendingTrade {
  from_player_id: string
  to_player_id: string
  offer_cash: number
  offer_properties: number[]
  offer_get_out_cards: number
  request_cash: number
  request_properties: number[]
  request_get_out_cards?: number
}

export interface MonopolyLastRentEvent {
  seq: number
  payer_player_id: string
  owner_player_id: string
  amount: number
  space_name: string
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

export interface MonopolyLastCashEvent {
  seq: number
  player_id: string
  change: number
  balance_after: number
  label: string
  bankrupt?: boolean
}

export interface MonopolyLastTradeEvent {
  seq: number
  from_player_id: string
  to_player_id: string
  outcome: 'proposed' | 'declined' | 'accepted'
}

export interface MonopolyBoard {
  id: string
  game_id: string
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
  chance_deck: number[]
  community_deck: number[]
  chance_discard: number[]
  community_discard: number[]
  auction_state: MonopolyAuctionState | null
  pending_trade: MonopolyPendingTrade | null
  pending_debt: MonopolyPendingDebt | null
  pending_space: number | null
  status_message: string | null
  last_card_event: MonopolyLastCardEvent | null
  last_rent_event: MonopolyLastRentEvent | null
  last_cash_event: MonopolyLastCashEvent | null
  last_trade_event: MonopolyLastTradeEvent | null
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

export type YahtzeePhase = 'rolling' | 'finished'

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
  created_at: string
  updated_at: string
}

export type YahtzeeCategoryPoints = Record<YahtzeeCategory, number | null>

export interface YahtzeePlayerScore {
  id: string
  game_id: string
  player_id: string
  scores: {
    categories: YahtzeeCategoryPoints
  }
  player_order: number
  created_at: string
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
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface WhotPlayerHand {
  id: string
  game_id: string
  player_id: string
  cards: WhotCard[]
  player_order: number
  created_at: string
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue'
export type LudoPieceZone = 'base' | 'track' | 'home' | 'finished'
export type LudoPhase = 'roll' | 'move' | 'finished'

export interface LudoDiceRoll {
  d1: number
  d2: number
  total: number
  doubles: boolean
}

export interface LudoPiece {
  id: number
  zone: LudoPieceZone
  /** Base yard: 0–3 (home circle). Track: 0–51. Home lane: 0–4 before finish. */
  pos: number
}

export interface LudoSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: LudoPhase
  last_dice: LudoDiceRoll | null
  /** Die values still to play this turn, e.g. [6, 3] after rolling 6+3. */
  remaining_dice: number[] | null
  consecutive_sixes: number
  extra_turn: boolean
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface LudoPlayerState {
  id: string
  game_id: string
  player_id: string
  color: LudoColor
  pieces: LudoPiece[]
  player_order: number
  created_at: string
}

export type TicTacToeMark = 'X' | 'O'

/** Result of a single sub-board: a winning mark, a filled draw, or still in play. */
export type TicTacToeBoardResult = TicTacToeMark | 'draw' | null

export interface TicTacToeSession {
  id: string
  game_id: string
  player_x_id: string
  player_o_id: string
  /** 81 cells — nine 3x3 sub-boards laid out row-major (sub-board = floor(i/9), cell = i%9). */
  board: (TicTacToeMark | null)[]
  /** Outcome of each of the 9 sub-boards. */
  board_winners: TicTacToeBoardResult[]
  /** Sub-board (0-8) the current player must play in, or null to play anywhere. */
  active_board: number | null
  current_turn_mark: TicTacToeMark
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type ChessColor = 'w' | 'b'

export interface ChessSession {
  id: string
  game_id: string
  player_white_id: string
  player_black_id: string
  /** Current position in Forsyth–Edwards Notation. */
  fen: string
  /** Full move history in Portable Game Notation. */
  pgn: string
  current_turn: ChessColor
  /** Remaining clock for each player in milliseconds; null when the game is untimed. */
  white_time_ms: number | null
  black_time_ms: number | null
  /** When the player on the move started their clock — used to compute elapsed time. */
  turn_started_at: string | null
  /** Squares of the most recent move, for highlighting (e.g. 'e2' -> 'e4'). */
  last_move_from: string | null
  last_move_to: string | null
  in_check: boolean
  status: 'active' | 'finished'
  /** checkmate | stalemate | threefold | insufficient | fifty_move | timeout | resignation */
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface TriviaQuestion {
  question: string
  choices: string[]
  correctIndex: number
  category: TriviaCategory
}

export interface TriviaMetadata {
  question: string
  choices: string[]
  correct_index: number
  category: TriviaCategory
}

export interface TriviaAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  choice_index: number
  is_correct: boolean
  answered_at: string
  response_ms: number
  points: number
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
  created_at: string
  updated_at: string
}

export interface TtlGuess {
  id: string
  game_id: string
  round_id: string
  player_id: string
  guessed_index: number
  is_correct: boolean
  points: number
  guessed_at: string
}

export interface Participant {
  id: string
  game_id: string
  name: string
  gender: ParticipantGender
  photo_url: string | null
  description: string | null
  display_order: number
  /** MLT import mode: host adds names from the list into the poll. */
  in_mlt_poll?: boolean | null
  /** Player-submitted name for people-based poll games (RFGF, SMK, etc.). */
  submitted_by_player_id?: string | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  /** Who can vote: opposite-gender rule; `both` = every round. */
  gender: PlayerGender
  /** Male or female — shown in lobby, separate from vote preference. */
  identity_gender: ParticipantGender | null
  /** Import mode: which list name was claimed. */
  participant_id: string | null
  joined_at: string
  /** Read-only spectator (explicit choice or inferred for poll-game late join). */
  spectator?: boolean
  /** Monopoly board token id (car, hat, dog, …). */
  monopoly_token?: string | null
  /** Short code to resume this player on another device. */
  resume_token?: string | null
}

export interface Round {
  id: string
  game_id: string
  round_number: number
  participant_ids: string[]
  wyr_option_a: string | null
  wyr_option_b: string | null
  mlt_question: string | null
  submitter_player_id: string | null
  quote_text: string | null
  quote_author_participant_id: string | null
  quote_submitted_at: string | null
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
  anime_metadata?: AnimeMetadata | null
  trivia_metadata?: TriviaMetadata | null
  ttl_metadata?: TtlMetadata | null
  npat_metadata?: NpatMetadata | null
}

export type PairFlag = 'kiss' | 'kill'
export type PairAssignmentMap = Record<string, PairFlag | null>

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

export interface VoteAssignment {
  kiss: string | null
  marry: string | null
  kill: string | null
}

export interface Confession {
  id: string
  game_id: string
  round_id: string | null
  text: string
  created_at: string
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

/** Lobby quote submission for Who Said This — players can add multiple quotes before the game starts. */
export interface WstQuotePoolEntry {
  id: string
  game_id: string
  player_id: string | null
  quote_text: string
  author_participant_id: string
  created_at: string
  updated_at: string
}

export interface AnimeMetadata {
  source: 'anime'
  anime_name: string
  correct_character: string
  choices: string[]
}

export interface AnimeQuotePoolEntry {
  id: string
  game_id: string
  quote_text: string
  anime_name: string
  correct_character: string
  choices: string[]
  removed: boolean
  created_at: string
}

export type WstQuoteSource = 'player' | 'anime' | 'both'

export interface BingoCard {
  id: string
  game_id: string
  player_id: string
  cells: number[]
  marked_indices: number[]
  created_at: string
}

export interface BingoCalledNumber {
  id: string
  game_id: string
  number: number
  called_at: string
}

export interface BingoClaim {
  id: string
  game_id: string
  player_id: string
  pattern: 'line' | 'full_house'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}
