export interface TournamentEliminationConfig {
  mode: 'lives'
  startingLives: number
  livesLostRule: 'bottom-n'
  eliminateCount: number
}

export type TournamentFormat = 'round-robin' | 'head-to-head' | 'knockout'

// Per-round setup for the game a head-to-head/knockout tournament is played with,
// captured at creation and reused every round. For trivia knockout: how many
// questions each round's group game has and the per-question timer.
export interface TournamentGameConfig {
  questionSource?: 'platform' | 'custom'
  roundsCount?: number
  timerSeconds?: number
}

export interface Tournament {
  id: string
  host_token: string
  title: string
  status: 'waiting' | 'active' | 'finished'
  format: TournamentFormat
  // The game a head-to-head/knockout tournament is played with (e.g. 'chess',
  // 'trivia'); null for round-robin.
  game_type: string | null
  game_config: TournamentGameConfig | null
  placement_points: number[]
  target_game_count: number | null
  max_players: number | null
  elimination_config: TournamentEliminationConfig | null
  created_at: string
}

export interface TournamentPlayer {
  id: string
  tournament_id: string
  player_name: string
  total_points: number
  games_played: number
  joined_at: string
  lives_remaining: number | null
  is_eliminated: boolean
  eliminated_at?: string | null
}

export interface TournamentGame {
  id: string
  tournament_id: string
  // Null for a bye row, which advances a player without a game room.
  game_id: string | null
  game_order: number
  status: 'pending' | 'active' | 'finished'
  placements: Record<string, number> | null
  // Head-to-head bracket fields (null for round-robin games).
  round_number: number | null
  match_index: number | null
  player_a_id: string | null
  player_b_id: string | null
  winner_player_id: string | null
  is_bye: boolean
}
