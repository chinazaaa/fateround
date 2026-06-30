// Types for the community public leaderboard (manual-entry winners).
// See supabase/migrations/20260630120000_community_leaderboard.sql.

export type CommunityGame = {
  id: string
  name: string
  slug: string
  accent: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export type CommunityPlayer = {
  id: string
  display_name: string
  normalized_name: string
  created_at: string
}

export type CommunityResult = {
  id: string
  game_id: string
  player_id: string
  result_date: string // YYYY-MM-DD (WAT calendar date)
  recorded_by: string
  recorded_at: string
}

// The leaderboard time windows.
export type LeaderboardWindow = 'today' | 'week' | 'month'

// One game's winner for a given day (used by the manager entry form + Today view).
export type DailyGameWinner = {
  game: Pick<CommunityGame, 'id' | 'name' | 'slug' | 'accent'>
  winnerName: string | null
}

// A ranked player in the weekly/monthly standings.
export type LeaderboardStanding = {
  rank: number // shared rank on ties
  playerName: string
  wins: number
  gamesWon: number // distinct games won (tie-breaker)
}

// Shape returned by GET /api/leaderboard.
export type LeaderboardResponse = {
  window: LeaderboardWindow
  label: string // e.g. "Tuesday, 30 June" / "23–29 June" / "June 2026"
  rangeStart: string // YYYY-MM-DD
  rangeEnd: string // YYYY-MM-DD (inclusive)
  today: DailyGameWinner[] // populated for window === 'today'
  standings: LeaderboardStanding[] // populated for window === 'week' | 'month'
}
