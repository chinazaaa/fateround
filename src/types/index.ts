export type GameStatus = 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type AutoSubmitBehavior = 'random' | 'no_answer'
export type ParticipantMode = 'import' | 'joiners' | 'voters'
/** Pair games: `any` = 2 smash OK; `one_each` = must pick one of each option. */
export type PairVoteMode = 'any' | 'one_each'
/** WYR / MLT: built-in pool vs host-uploaded CSV questions. */
export type QuestionSource = 'platform' | 'custom'
/** How player-submitted lobby questions are mixed with uploaded/platform questions. */
export type PlayerQuestionsOrder = 'players_first' | 'uploaded_first' | 'mixed'
export type GameType =
  | 'smash_marry_kill'
  | 'red_flag_green_flag'
  | 'smash_or_pass'
  | 'would_you_rather'
  | 'this_or_that'
  | 'most_likely_to'
  | 'who_said_this'
  | 'hot_seat'
  | 'custom'
  | 'anonymous_messages'
  | 'secret_message'
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
  /** Anonymous room — when the live session started (15 min cap). */
  session_started_at?: string | null
  /** Anonymous room — max players allowed in the lobby (2–20). */
  max_players?: number | null
  /** Anonymous room — last time a batch of old messages was trimmed. */
  anonymous_messages_trimmed_at?: string | null
  wst_quote_source?: WstQuoteSource
  custom_slots?: CustomSlotsConfig | null
  /** When true, rounds use same-gender groups and opposite-gender voting. Default true for SMK/pair, false for custom. */
  gender_based?: boolean
  /** Cumulative usage across play-again sessions — unused pool items are prioritized next game. */
  pool_usage?: Record<string, unknown> | null
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

/** Lobby quote submission for Who Said This — one per player before the game starts. */
export interface WstQuotePoolEntry {
  id: string
  game_id: string
  player_id: string
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
