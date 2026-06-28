export interface Tournament {
  id: string
  host_token: string
  title: string
  status: 'waiting' | 'active' | 'finished'
  placement_points: number[]
  target_game_count: number | null
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
  game_id: string
  game_order: number
  status: 'pending' | 'active' | 'finished'
  placements: Record<string, number> | null
}
