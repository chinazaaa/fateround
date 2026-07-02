import type { ParticipantMode, PairVoteMode, GameType, DescribeItMode, ThemeId } from '@/types'

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
  describe_it_num_teams: number
  describe_it_mode: DescribeItMode
}

export type Step = 'settings' | 'participants' | 'done'
export type ParticipantTab = 'upload' | 'manual'
export type QuestionTab = 'upload' | 'manual' | 'ai'
