/** Lightweight seat checks for mobile clients (uses max_players when set). */

export function seatedParticipantCount(players: ReadonlyArray<{ spectator?: boolean | null }>): number {
  return players.filter((p) => p.spectator !== true).length
}

export function lobbyHasOpenPlayerSeat(
  game: { max_players?: number | null },
  players: ReadonlyArray<{ spectator?: boolean | null }>
): boolean {
  if (game.max_players == null) return true
  return seatedParticipantCount(players) < game.max_players
}
