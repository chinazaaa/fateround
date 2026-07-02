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
  // Per-round timer: trivia knockout = seconds per question; Whot/Scrabble
  // head-to-head = seconds per turn in each room.
  timerSeconds?: number
  // Head-to-head room size: 2 for chess (1v1), 4 for Whot/Scrabble group rooms.
  groupSize?: number
  // Whot house rules applied to every spawned room (default true when omitted).
  whotPick3?: boolean
  whotCards?: boolean
  whotNumberCalls?: boolean
  whotPick2Stacking?: boolean
  // Scrabble word list id (see SCRABBLE_DICTIONARY_OPTIONS).
  scrabbleDictionary?: string
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
  // The underlying game's own status ('waiting' before it's started), attached by
  // the tournament GET so the lobby can start a spawned game without a dashboard.
  game_status?: 'waiting' | 'active' | 'finished' | null
  placements: Record<string, number> | null
  // Head-to-head bracket fields (null for round-robin games).
  round_number: number | null
  match_index: number | null
  player_a_id: string | null
  player_b_id: string | null
  // Group-bracket rooms (Whot/Scrabble, up to 4 players): the tournament_player ids
  // seated in this room. Null for chess, which uses player_a_id/player_b_id.
  member_ids: string[] | null
  winner_player_id: string | null
  // How the match was decided (e.g. 'checkmate', 'timeout', 'resignation', 'walkover').
  win_reason?: string | null
  is_bye: boolean
}
