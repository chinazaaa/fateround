import type {
  ParticipantMode,
  PairVoteMode,
  GameType,
  DescribeItMode,
  QuickDrawVariant,
  QuickDrawPlayMode,
  WordRushMode,
  WordRushPromptMode,
  WordRushDifficulty,
  ThemeId,
} from '@/types'

export interface Settings {
  title: string
  /** Player-facing content label for CSV/library games ("Maths", "Bible trivia").
   *  Auto-filled from the selected library pack name; typed by the host for a CSV upload. */
  content_label: string
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
  quick_draw_variant: QuickDrawVariant
  quick_draw_play_mode: QuickDrawPlayMode
  quick_draw_num_teams: number
  word_rush_num_teams: number
  word_rush_mode: WordRushMode
  word_rush_prompt_mode: WordRushPromptMode
  word_rush_difficulty: WordRushDifficulty
  max_players?: number
  game_duration_seconds?: number
  mafia_doctor_enabled?: boolean
  mafia_detective_enabled?: boolean
  mafia_bodyguard_enabled?: boolean
  mafia_mayor_enabled?: boolean
  mafia_vigilante_enabled?: boolean
  mafia_tracker_enabled?: boolean
  mafia_alpha_wolf_enabled?: boolean
  mafia_wolf_cub_enabled?: boolean
  mafia_framer_enabled?: boolean
  mafia_jester_enabled?: boolean
  mafia_serial_killer_enabled?: boolean
  mafia_arsonist_enabled?: boolean
  mafia_cupid_enabled?: boolean
  mafia_cursed_villager_enabled?: boolean
  mafia_anonymous_votes?: boolean
  mafia_day_seconds?: number
  mafia_voting_seconds?: number
  ping_pong_points_to_win?: number
}

export type Step = 'settings' | 'participants' | 'done'
export type ParticipantTab = 'upload' | 'manual'
export type QuestionTab = 'upload' | 'manual' | 'ai'
