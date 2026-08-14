export interface TournamentEliminationConfig {
  mode: 'lives'
  startingLives: number
  livesLostRule: 'bottom-n'
  eliminateCount: number
}

export type TournamentFormat = 'round-robin' | 'head-to-head' | 'knockout' | 'school'

// Per-round setup for the game a head-to-head/knockout tournament is played with,
// captured at creation and reused every round. For trivia knockout: how many
// questions each round's group game has and the per-question timer.
export interface TournamentGameConfig {
  questionSource?: 'platform' | 'custom'
  roundsCount?: number
  // Per-round timer: trivia knockout = seconds per question; Whot/Scrabble
  // head-to-head = seconds per turn in each room.
  timerSeconds?: number
  // Whot/Scrabble head-to-head: max room length in seconds (0 = no limit), so a
  // room can't run for hours. Enforced against each room's session_started_at.
  gameDurationSeconds?: number
  // Head-to-head room size: 2 for chess (1v1), 4 for Whot/Scrabble group rooms.
  groupSize?: number
  // Whot house rules applied to every spawned room (default true when omitted).
  whotPick3?: boolean
  whotCards?: boolean
  whotNumberCalls?: boolean
  whotPick2Stacking?: boolean
  // Scrabble word list id (see SCRABBLE_DICTIONARY_OPTIONS).
  scrabbleDictionary?: string
  // School format: how many classes make up the ladder (e.g. 6 = Primary only,
  // 16 = the full Primary→University ladder). Winning while in the top class
  // graduates a player and wins the tournament.
  schoolClassCount?: number
}

// One entry in a round-robin tournament's pre-planned playlist.
export interface TournamentQueueEntry {
  gameType: string
  roundsCount?: number
  timerSeconds?: number
  /** Display mode for this game — 'projector' shows the game's current state
   *  on the big screen (question / letter / etc.); 'phone_only' (default)
   *  leaves the big screen on the leaderboard. */
  bigScreenMode?: 'phone_only' | 'projector'
}

// Optional event branding — two colours + a logo — that the host attaches at
// creation (or edits later). Applied to the lobby, in-game header, and results
// card via CSS custom properties. Null / all-fields-empty = default palette.
export interface TournamentBranding {
  primaryColor?: string | null
  accentColor?: string | null
  logoUrl?: string | null
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
  // Round-robin only: the ordered playlist of games. Non-empty = planned
  // mode (auto-spawn each round from this list); null/empty = freestyle
  // mode (host picks each game live).
  game_queue: TournamentQueueEntry[] | null
  // Present ONLY on the raw DB row — never on the API response, since the
  // shared trivia pack contains answers. The public GET returns the count
  // separately (as `customTriviaPackCount`) instead of the raw questions.
  custom_trivia_pack?: unknown[] | null
  // Event branding — two colours + logo. Public info: safe to ship to any
  // caller with the tournament code (that's the whole point).
  branding: TournamentBranding | null
  // Optional scheduled start time (ISO string). Display-only: the host still
  // controls the actual start via "Start Next Game" on the day.
  scheduled_at: string | null
  // Claim-based host transfer: when non-null, this tournament_players.id is
  // the pending nominee. On accept, host_token rotates; on decline (or
  // cancel), this field returns to null.
  pending_host_player_id: string | null
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
  // School format: 0-based index of the class this player is currently in
  // (0 = the lowest class). Reaching the tournament's schoolClassCount = graduated.
  school_level?: number
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
  // The subset of this room's members who have joined the room to play (not as
  // spectators), attached by the tournament GET. Lets the lobby show the host which
  // players are in vs. who a staged round is still waiting on.
  joined_member_ids?: string[]
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
  // 'projector' → big-screen renders the game's current state (question /
  // letter / etc.); 'phone_only' (default) → big-screen stays on leaderboard.
  // Frozen at game spawn; can't change mid-game.
  big_screen_mode?: 'phone_only' | 'projector'
}
