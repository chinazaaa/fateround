export type GameStatus = 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type AutoSubmitBehavior = 'random' | 'no_answer'
export type ParticipantMode = 'import' | 'joiners'
export type GameType = 'smash_marry_kill' | 'red_flag_green_flag' | 'smash_or_pass' | 'would_you_rather' | 'most_likely_to'
export type WyrChoice = 'a' | 'b'

export type ParticipantGender = 'male' | 'female'
/** Gender selected when joining — `both` means vote on every round. */
export type PlayerGender = 'male' | 'female' | 'both'

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
  game_type: GameType
  status: GameStatus
  current_round_number: number
  created_at: string
}

export interface Participant {
  id: string
  game_id: string
  name: string
  gender: ParticipantGender
  photo_url: string | null
  description: string | null
  display_order: number
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
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
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
