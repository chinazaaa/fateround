// Achievement leaderboard entries: role-based awards derived from a base in-app
// game. Team/role games don't have a single "winner", so instead of one entry
// they feed SEVERAL leaderboard rows — one per role superlative (e.g. Codewords
// crowns a Best Spymaster and a Best Operative).
//
// Each achievement is its own community_games row, keyed by a synthetic
// game_type (e.g. 'codewords_spymaster'). The admin adds it like any other game;
// at match end the role winner auto-posts to it via the normal post-win flow.
//
// Client-safe: no server-only imports, so both the API and the UI can use it.

export type Achievement = {
  // Synthetic community game_type / leaderboard-entry key.
  key: string
  // Default leaderboard-row name (admin can rename).
  label: string
  // The real in-app game_type this award is derived from.
  baseGameType: string
  // Default accent colour for the leaderboard row.
  accent: string
}

export const GAME_ACHIEVEMENTS: Achievement[] = [
  { key: 'codewords_spymaster', label: 'Best Spymaster', baseGameType: 'codewords', accent: '#14b8a6' },
  { key: 'codewords_operative', label: 'Best Operative', baseGameType: 'codewords', accent: '#0ea5e9' },
  { key: 'two_truths_guesser', label: 'Best Guesser', baseGameType: 'two_truths', accent: '#8b5cf6' },
]

export function achievementByKey(key: string): Achievement | null {
  return GAME_ACHIEVEMENTS.find((a) => a.key === key) ?? null
}

// A submitted leaderboard target is valid only if it's the game that was actually
// played — either the real game_type itself (normal single-winner games) or one of
// that game's achievement entries. Guards the public post endpoint so a win can't
// be steered onto an unrelated board.
export function isValidLeaderboardType(realGameType: string, leaderboardType: string): boolean {
  if (leaderboardType === realGameType) return true
  return achievementByKey(leaderboardType)?.baseGameType === realGameType
}
