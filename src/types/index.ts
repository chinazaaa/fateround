export type GameStatus = 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type AutoSubmitBehavior = 'random' | 'no_answer'

export type ParticipantGender = 'male' | 'female'

export interface Game {
  id: string
  title: string
  host_token: string
  rounds_count: number
  timer_seconds: number
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: AutoSubmitBehavior
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
  gender: ParticipantGender
  joined_at: string
}

export interface Round {
  id: string
  game_id: string
  round_number: number
  participant_ids: string[]
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
}

export interface Vote {
  id: string
  player_id: string
  round_id: string
  game_id: string
  kiss_participant_id: string | null
  marry_participant_id: string | null
  kill_participant_id: string | null
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
