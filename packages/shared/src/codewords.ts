import type {
  CodewordsBoard,
  CodewordsCellType,
  CodewordsGuess,
  CodewordsPlayerRole,
  CodewordsRole,
  CodewordsTeam,
  Game,
} from './types'

export const CODEWORDS_MIN_PLAYERS = 4
export const CODEWORDS_MAX_PLAYERS = 20
export const CODEWORDS_GRID_SIZE = 25

/**
 * "Can this Codewords lobby start?" — the same gate the server enforces in
 * /api/games/[code]/start, exposed for clients so the Start button doesn't
 * advertise a click that the server will reject.
 *
 * - Player picks / host assigns: every seated player has a role, and each team
 *   has exactly one spymaster and at least one operative.
 * - Randomize teams: the host only has to pick a spymaster per team; the shuffle
 *   at start fills in the operatives.
 */
type CodewordsLobbyRoleLike = {
  player_id: string
  team: CodewordsTeam
  role: CodewordsRole
}

export function lobbyReadyForCodewords(
  roles: CodewordsLobbyRoleLike[],
  seatedPlayerIds: string[],
  randomizeTeams: boolean
): { ok: boolean; error?: string } {
  if (seatedPlayerIds.length < CODEWORDS_MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${CODEWORDS_MIN_PLAYERS} players` }
  }
  const seated = new Set(seatedPlayerIds)
  // Only roles for seated (ready) players count — a benched or spectating player
  // holding an old role should not satisfy the gate.
  const activeRoles = roles.filter((r) => seated.has(r.player_id))
  const redSpymasters = activeRoles.filter((r) => r.team === 'red' && r.role === 'spymaster').length
  const blueSpymasters = activeRoles.filter((r) => r.team === 'blue' && r.role === 'spymaster').length
  if (redSpymasters !== 1) return { ok: false, error: 'Pick exactly one red spymaster' }
  if (blueSpymasters !== 1) return { ok: false, error: 'Pick exactly one blue spymaster' }
  if (randomizeTeams) return { ok: true }
  // Full assignment path: every seated player needs a role, and each team needs
  // at least one operative in addition to the spymaster.
  const roleByPlayerId = new Map(activeRoles.map((r) => [r.player_id, r]))
  const anyUnassigned = seatedPlayerIds.some((id) => !roleByPlayerId.has(id))
  if (anyUnassigned) return { ok: false, error: 'Every player needs a team and role' }
  const redOperatives = activeRoles.filter((r) => r.team === 'red' && r.role === 'operative').length
  const blueOperatives = activeRoles.filter((r) => r.team === 'blue' && r.role === 'operative').length
  if (redOperatives < 1) return { ok: false, error: 'Red team needs at least 1 operative' }
  if (blueOperatives < 1) return { ok: false, error: 'Blue team needs at least 1 operative' }
  return { ok: true }
}

export function secondsUntilDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
}

export function isTurnExpired(deadline: string | null | undefined): boolean {
  if (!deadline) return false
  return Date.parse(deadline) <= Date.now()
}

export function effectiveTurnPhase(board: {
  turn_phase?: 'clue' | 'guess' | null
  current_clue_word?: string | null
}): 'clue' | 'guess' {
  if (board.turn_phase) return board.turn_phase
  return board.current_clue_word ? 'guess' : 'clue'
}

export function teamLabel(team: CodewordsTeam): string {
  return team === 'red' ? 'Red' : 'Blue'
}

export function roleLabel(role: CodewordsRole): string {
  return role === 'spymaster' ? 'Spymaster' : 'Operative'
}

export function codewordsPlayerPicks(game: Pick<Game, 'codewords_player_picks'>): boolean {
  return game.codewords_player_picks !== false
}

export function codewordsLateJoin(game: Pick<Game, 'codewords_late_join'>): boolean {
  return game.codewords_late_join === true
}

export function codewordsRandomizeTeams(game: Pick<Game, 'codewords_randomize_teams'>): boolean {
  return game.codewords_randomize_teams === true
}

export function countTeamCells(key: CodewordsCellType[], team: CodewordsTeam): number {
  return key.filter((cell) => cell === team).length
}

export function countRevealedTeamCells(key: CodewordsCellType[], revealed: number[], team: CodewordsTeam): number {
  return revealed.filter((index) => key[index] === team).length
}

export function guessAttributionMap(
  guesses: Array<{ cell_index: number; player_id: string }>,
  playerNameById: Map<string, string>
): Record<number, string> {
  const map: Record<number, string> = {}
  for (const guess of guesses) {
    const name = playerNameById.get(guess.player_id)
    if (name) map[guess.cell_index] = name
  }
  return map
}

export function waitingTurnMessage(
  board: CodewordsBoard,
  roles: Array<{ player_id: string; team: CodewordsTeam; role: CodewordsRole }>,
  playerNameById: Map<string, string>
): string {
  const phase = effectiveTurnPhase(board)
  const team = board.current_turn
  const label = teamLabel(team)

  if (phase === 'clue') {
    const spymaster = roles.find((r) => r.team === team && r.role === 'spymaster')
    const name = spymaster ? playerNameById.get(spymaster.player_id) : null
    return name
      ? `Waiting for ${name} (${label} spymaster) to give a clue`
      : `Waiting for ${label} spymaster to give a clue`
  }

  return `Waiting for ${label} operatives to guess`
}

export function mergeCodewordsGuesses(
  prev: CodewordsGuess[],
  incoming: CodewordsGuess | CodewordsGuess[]
): CodewordsGuess[] {
  const rows = Array.isArray(incoming) ? incoming : [incoming]
  const byId = new Map(prev.map((g) => [g.id, g]))
  for (const guess of rows) byId.set(guess.id, guess)
  return Array.from(byId.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function cellBackground(type: CodewordsCellType, revealed: boolean, showKey: boolean): string {
  if (!revealed && !showKey) return '#c9b896'
  switch (type) {
    case 'red':
      return revealed ? '#fca5a5' : '#fecaca'
    case 'blue':
      return revealed ? '#93c5fd' : '#bfdbfe'
    case 'assassin':
      return revealed ? '#525252' : '#737373'
    default:
      return revealed ? '#fde68a' : '#fef3c7'
  }
}

/**
 * Foreground colour for a cell's word, paired with {@link cellBackground}. Every
 * cell sits on a light background and reads best in near-black — except the
 * exposed assassin, whose background is dark grey, so its label needs light text
 * to stay legible (otherwise the bomb word is black-on-black on the reveal).
 */
export function cellTextColor(type: CodewordsCellType, revealed: boolean, showKey: boolean): string {
  if ((revealed || showKey) && type === 'assassin') return '#f4f4f5'
  return '#171717'
}
