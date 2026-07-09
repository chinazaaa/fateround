import type {
  ParticipantMode,
  PairVoteMode,
  GameType,
  DescribeItMode,
  WordRushMode,
  WordRushPromptMode,
  ThemeId,
} from '@/types'

export interface Settings {
  title: string
  rounds_count: number
  timer_seconds: number
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: 'random' | 'no_answer'
  participant_mode: ParticipantMode
  pair_vote_mode: PairVoteMode
  game_type: GameType
  theme: ThemeId
  participant_filter: 'all' | 'joined'
  gender_based: boolean
  /** Public games are listed in /browse for anyone to find and join; private = code-only. */
  isPublic: boolean
  describe_it_num_teams: number
  describe_it_mode: DescribeItMode
  word_rush_num_teams: number
  word_rush_mode: WordRushMode
  word_rush_prompt_mode: WordRushPromptMode
  max_players?: number
  game_duration_seconds?: number
  mafia_doctor_enabled?: boolean
  mafia_detective_enabled?: boolean
  mafia_anonymous_votes?: boolean
}

export type Step = 'settings' | 'participants' | 'done'
export type ParticipantTab = 'upload' | 'manual'
export type QuestionTab = 'upload' | 'manual' | 'ai'
