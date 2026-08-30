import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { markGameFinished } from '@/lib/game-finish'
import { parseQuestionSource } from '@/lib/custom-questions'
import {
  CODEWORDS_BOARD_SIZE,
  CODEWORDS_MIN_CUSTOM_POOL,
  codewordPoolKey,
  parseStoredCodewordsWords,
  pickBoardWordsFromPool,
} from '@/lib/codewords-pool'
import { isCodewordsGame, parseGameType } from '@/lib/game-types'
import type {
  CodewordsBoard,
  CodewordsCellType,
  CodewordsGuess,
  CodewordsPlayerRole,
  CodewordsRole,
  CodewordsTeam,
  Game,
} from '@/types'
import { CODEWORDS_DEFAULT_MAX_PLAYERS, CODEWORDS_MAX_PLAYERS, CODEWORDS_MIN_PLAYERS } from '@/lib/player-limits'
export { CODEWORDS_DEFAULT_MAX_PLAYERS, CODEWORDS_MAX_PLAYERS, CODEWORDS_MIN_PLAYERS }

export const CODEWORDS_GRID_SIZE = CODEWORDS_BOARD_SIZE
export { CODEWORDS_MIN_CUSTOM_POOL }

export function clampCodewordsMaxPlayers(value: number): number {
  return Math.min(CODEWORDS_MAX_PLAYERS, Math.max(CODEWORDS_MIN_PLAYERS, value))
}

export function codewordsMaxPlayers(game: { max_players?: number | null }): number {
  if (game.max_players == null) return CODEWORDS_DEFAULT_MAX_PLAYERS
  return clampCodewordsMaxPlayers(game.max_players)
}

export const CODEWORDS_DEFAULT_SPYMASTER_TIMER = 60
export const CODEWORDS_DEFAULT_OPERATIVE_TIMER = 60
export const CODEWORDS_TIMER_OPTIONS = [30, 45, 60, 90, 120] as const

export function clampCodewordsTimer(value: number): number {
  return CODEWORDS_TIMER_OPTIONS.includes(value as (typeof CODEWORDS_TIMER_OPTIONS)[number])
    ? value
    : CODEWORDS_DEFAULT_SPYMASTER_TIMER
}

export function turnDeadline(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

export function secondsUntilDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

export function isTurnExpired(deadline: string | null | undefined): boolean {
  if (!deadline) return false
  return new Date(deadline).getTime() <= Date.now()
}

export function cluePhaseUpdate(team: CodewordsTeam, spymasterSeconds: number) {
  return {
    current_turn: team,
    current_clue_word: null,
    current_clue_number: null,
    guesses_remaining: null,
    turn_phase: 'clue' as const,
    turn_deadline_at: turnDeadline(spymasterSeconds),
  }
}

export function guessPhaseUpdate(operativeSeconds: number) {
  return {
    turn_phase: 'guess' as const,
    turn_deadline_at: turnDeadline(operativeSeconds),
  }
}

export function effectiveTurnPhase(board: {
  turn_phase?: 'clue' | 'guess' | null
  current_clue_word?: string | null
}): 'clue' | 'guess' {
  if (board.turn_phase) return board.turn_phase
  return board.current_clue_word ? 'guess' : 'clue'
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export { codewordPoolKey } from '@/lib/codewords-pool'

export function codewordsWordPoolForGame(
  game: Pick<Game, 'game_type' | 'question_source' | 'custom_questions'>
): string[] | null {
  if (!isCodewordsGame(parseGameType(game.game_type))) return null
  if (parseQuestionSource(game.question_source, game.game_type) !== 'custom') return null
  const words = parseStoredCodewordsWords(game.custom_questions)
  return words.length > 0 ? words : null
}

export function pickBoardWords(pool?: readonly string[], usageCounts: Map<string, number> = new Map()): string[] {
  return pickBoardWordsFromPool(pool, usageCounts)
}

export function generateKey(startingTeam: CodewordsTeam): CodewordsCellType[] {
  const key: CodewordsCellType[] = Array(CODEWORDS_GRID_SIZE).fill('neutral')
  const indices = shuffle(Array.from({ length: CODEWORDS_GRID_SIZE }, (_, i) => i))
  const teamCount = 9
  const neutralCount = CODEWORDS_GRID_SIZE - teamCount * 2 - 1 // 6 neutrals + 1 assassin

  for (let i = 0; i < teamCount; i += 1) {
    key[indices[i]] = startingTeam
  }
  const otherTeam: CodewordsTeam = startingTeam === 'red' ? 'blue' : 'red'
  for (let i = teamCount; i < teamCount * 2; i += 1) {
    key[indices[i]] = otherTeam
  }
  for (let i = teamCount * 2; i < teamCount * 2 + neutralCount; i += 1) {
    key[indices[i]] = 'neutral'
  }
  key[indices[CODEWORDS_GRID_SIZE - 1]] = 'assassin'
  return key
}

export function countTeamCells(key: (CodewordsCellType | null)[], team: CodewordsTeam): number {
  return key.filter((cell) => cell === team).length
}

export function countRevealedTeamCells(
  key: (CodewordsCellType | null)[],
  revealed: number[],
  team: CodewordsTeam
): number {
  return revealed.filter((index) => key[index] === team).length
}

export function teamWon(key: (CodewordsCellType | null)[], revealed: number[], team: CodewordsTeam): boolean {
  return countRevealedTeamCells(key, revealed, team) >= countTeamCells(key, team)
}

/** First team with all words revealed wins — regardless of who revealed the last word. */
export function winnerFromRevealedBoard(key: (CodewordsCellType | null)[], revealed: number[]): CodewordsTeam | null {
  if (teamWon(key, revealed, 'red')) return 'red'
  if (teamWon(key, revealed, 'blue')) return 'blue'
  return null
}

export function otherTeam(team: CodewordsTeam): CodewordsTeam {
  return team === 'red' ? 'blue' : 'red'
}

export function teamLabel(team: CodewordsTeam): string {
  return team === 'red' ? 'Red' : 'Blue'
}

export function roleLabel(role: CodewordsRole): string {
  return role === 'spymaster' ? 'Spymaster' : 'Operative'
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

export function cellColorClass(type: CodewordsCellType, revealed: boolean): string {
  if (!revealed) return 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-[var(--foreground)]/85'
  switch (type) {
    case 'red':
      return 'border-red-600 bg-red-200 text-red-950 dark:border-red-400 dark:bg-red-500/40 dark:text-red-50'
    case 'blue':
      return 'border-blue-600 bg-blue-200 text-blue-950 dark:border-blue-400 dark:bg-blue-500/40 dark:text-blue-50'
    case 'assassin':
      return 'border-neutral-900 bg-neutral-800 text-white dark:border-neutral-600 dark:bg-neutral-900'
    default:
      return 'border-amber-600 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-500/25 dark:text-amber-50'
  }
}

export function spymasterCellClass(type: CodewordsCellType, revealed: boolean): string {
  if (revealed) return cellColorClass(type, true)
  switch (type) {
    case 'red':
      return 'border-red-500/80 bg-red-500/15 text-red-900 dark:text-red-100'
    case 'blue':
      return 'border-blue-500/80 bg-blue-500/15 text-blue-900 dark:text-blue-100'
    case 'assassin':
      return 'border-neutral-700 bg-neutral-700/20 text-neutral-900 dark:text-neutral-200'
    default:
      return 'border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-100'
  }
}

export type CodewordsLobbyRole = {
  player_id: string
  team: CodewordsTeam
  role: CodewordsRole
}

export function teamsNeedRandomization(playerIds: string[], roles: CodewordsLobbyRole[]): boolean {
  if (roles.length < playerIds.length) return true
  const operatives = roles.filter((r) => r.role === 'operative')
  return operatives.length < playerIds.length - 2
}

export function lobbyReadySpymasters(
  roles: CodewordsLobbyRole[],
  playerCount: number
): { ok: boolean; error?: string } {
  if (playerCount < CODEWORDS_MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${CODEWORDS_MIN_PLAYERS} players` }
  }
  const redSpymasters = roles.filter((r) => r.team === 'red' && r.role === 'spymaster')
  const blueSpymasters = roles.filter((r) => r.team === 'blue' && r.role === 'spymaster')
  if (redSpymasters.length !== 1) {
    return { ok: false, error: 'Pick exactly one red spymaster' }
  }
  if (blueSpymasters.length !== 1) {
    return { ok: false, error: 'Pick exactly one blue spymaster' }
  }
  return { ok: true }
}

export function lobbyReadyForGame(
  roles: CodewordsLobbyRole[],
  playerIds: string[],
  randomizeTeams: boolean
): { ok: boolean; error?: string } {
  if (playerIds.length < CODEWORDS_MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${CODEWORDS_MIN_PLAYERS} players` }
  }
  if (randomizeTeams && teamsNeedRandomization(playerIds, roles)) {
    return lobbyReadySpymasters(roles, playerIds.length)
  }
  return lobbyReady(roles)
}

export function buildRandomizedRoles(playerIds: string[], roles: CodewordsLobbyRole[]): CodewordsLobbyRole[] {
  const redSpy = roles.find((r) => r.team === 'red' && r.role === 'spymaster')
  const blueSpy = roles.find((r) => r.team === 'blue' && r.role === 'spymaster')
  if (!redSpy || !blueSpy) {
    throw new Error('Pick one red and one blue spymaster before shuffling teams')
  }

  const operativePool = playerIds.filter((id) => id !== redSpy.player_id && id !== blueSpy.player_id)
  const shuffled = shuffle(operativePool)
  const redCount = Math.ceil(shuffled.length / 2)
  const redOps = shuffled.slice(0, redCount)
  const blueOps = shuffled.slice(redCount)

  return [
    redSpy,
    blueSpy,
    ...redOps.map((player_id) => ({ player_id, team: 'red' as const, role: 'operative' as const })),
    ...blueOps.map((player_id) => ({ player_id, team: 'blue' as const, role: 'operative' as const })),
  ]
}

export async function persistRandomizedRoles(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[],
  roles: CodewordsLobbyRole[]
): Promise<{ roles: CodewordsLobbyRole[]; error: string | null }> {
  const nextRoles = buildRandomizedRoles(playerIds, roles)
  for (const role of nextRoles) {
    const { error } = await supabase
      .from('codewords_player_roles')
      .upsert(
        { game_id: gameId, player_id: role.player_id, team: role.team, role: role.role },
        { onConflict: 'game_id,player_id' }
      )
    if (error) return { roles: nextRoles, error: internalErrorMessage('codewords', error) }
  }
  const assigned = new Set(nextRoles.map((r) => r.player_id))
  for (const playerId of playerIds) {
    if (!assigned.has(playerId)) {
      await supabase.from('codewords_player_roles').delete().eq('game_id', gameId).eq('player_id', playerId)
    }
  }
  return { roles: nextRoles, error: null }
}

export function lobbyReady(roles: CodewordsLobbyRole[]): { ok: boolean; error?: string } {
  const redSpymasters = roles.filter((r) => r.team === 'red' && r.role === 'spymaster')
  const blueSpymasters = roles.filter((r) => r.team === 'blue' && r.role === 'spymaster')
  const redOperatives = roles.filter((r) => r.team === 'red' && r.role === 'operative')
  const blueOperatives = roles.filter((r) => r.team === 'blue' && r.role === 'operative')

  if (redSpymasters.length !== 1) {
    return { ok: false, error: 'Red team needs exactly 1 spymaster' }
  }
  if (blueSpymasters.length !== 1) {
    return { ok: false, error: 'Blue team needs exactly 1 spymaster' }
  }
  if (redOperatives.length < 1) {
    return { ok: false, error: 'Red team needs at least 1 operative' }
  }
  if (blueOperatives.length < 1) {
    return { ok: false, error: 'Blue team needs at least 1 operative' }
  }
  return { ok: true }
}

export function lobbyTeamSummary(roles: CodewordsLobbyRole[], team: CodewordsTeam) {
  const teamRoles = roles.filter((r) => r.team === team)
  return {
    total: teamRoles.length,
    spymasters: teamRoles.filter((r) => r.role === 'spymaster').length,
    operatives: teamRoles.filter((r) => r.role === 'operative').length,
  }
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

export function mergeCodewordsRoles(
  prev: CodewordsPlayerRole[],
  incoming: CodewordsPlayerRole | CodewordsPlayerRole[],
  removedId?: string
): CodewordsPlayerRole[] {
  const byPlayer = new Map(prev.map((r) => [r.player_id, r]))
  if (removedId) byPlayer.delete(removedId)
  const rows = Array.isArray(incoming) ? incoming : [incoming]
  for (const role of rows) byPlayer.set(role.player_id, role)
  return Array.from(byPlayer.values())
}

export function codewordsPlayerPicks(game: Pick<Game, 'codewords_player_picks'>): boolean {
  return game.codewords_player_picks !== false
}

export function codewordsLateJoin(game: Pick<Game, 'codewords_late_join'>): boolean {
  return game.codewords_late_join === true
}

export function pickBalancedOperativeTeam(roles: CodewordsLobbyRole[]): CodewordsTeam {
  const redOps = roles.filter((r) => r.team === 'red' && r.role === 'operative').length
  const blueOps = roles.filter((r) => r.team === 'blue' && r.role === 'operative').length
  if (redOps < blueOps) return 'red'
  if (blueOps < redOps) return 'blue'
  return Math.random() < 0.5 ? 'red' : 'blue'
}

export async function assignCodewordsLateJoinOperative(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ team: CodewordsTeam; role: CodewordsPlayerRole | null; error: string | null }> {
  const code = gameId.toUpperCase()
  const { data: roles, error: rolesError } = await supabase
    .from('codewords_player_roles')
    .select('player_id, team, role')
    .eq('game_id', code)

  if (rolesError) return { team: 'red', role: null, error: internalErrorMessage('codewords', rolesError) }

  const team = pickBalancedOperativeTeam((roles as CodewordsLobbyRole[]) ?? [])
  const { data: roleRow, error } = await supabase
    .from('codewords_player_roles')
    .upsert({ game_id: code, player_id: playerId, team, role: 'operative' }, { onConflict: 'game_id,player_id' })
    .select()
    .single()

  if (error) return { team, role: null, error: internalErrorMessage('codewords', error) }
  return { team, role: roleRow as CodewordsPlayerRole, error: null }
}

export function codewordsRandomizeTeams(game: Pick<Game, 'codewords_randomize_teams'>): boolean {
  return game.codewords_randomize_teams === true
}

export type CodewordsOperativeStat = {
  playerId: string
  name: string
  team: CodewordsTeam
  score: number
  correct: number
  wrong: number
  hitAssassin: boolean
}

export type CodewordsSpymasterStat = {
  playerId: string
  name: string
  team: CodewordsTeam
  score: number
  cluesGiven: number
  wordsFound: number
}

export function tallyCodewordsOperativeStats(
  guesses: CodewordsGuess[],
  roles: CodewordsPlayerRole[],
  players: Array<{ id: string; name: string }>
): CodewordsOperativeStat[] {
  const roleByPlayer = new Map(roles.map((r) => [r.player_id, r]))
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const stats = new Map<string, CodewordsOperativeStat>()

  for (const guess of guesses) {
    const role = roleByPlayer.get(guess.player_id)
    if (!role || role.role !== 'operative') continue

    let stat = stats.get(guess.player_id)
    if (!stat) {
      stat = {
        playerId: guess.player_id,
        name: nameById.get(guess.player_id) ?? 'Unknown',
        team: role.team,
        score: 0,
        correct: 0,
        wrong: 0,
        hitAssassin: false,
      }
      stats.set(guess.player_id, stat)
    }

    if (guess.cell_type === role.team) {
      stat.correct += 1
      stat.score += 10
    } else {
      stat.wrong += 1
      stat.score -= 2
      if (guess.cell_type === 'assassin') stat.hitAssassin = true
    }
  }

  for (const role of roles) {
    if (role.role !== 'operative' || stats.has(role.player_id)) continue
    stats.set(role.player_id, {
      playerId: role.player_id,
      name: nameById.get(role.player_id) ?? 'Unknown',
      team: role.team,
      score: 0,
      correct: 0,
      wrong: 0,
      hitAssassin: false,
    })
  }

  return Array.from(stats.values()).sort((a, b) => b.score - a.score || b.correct - a.correct)
}

export function tallyCodewordsSpymasterStats(
  guesses: CodewordsGuess[],
  roles: CodewordsPlayerRole[],
  players: Array<{ id: string; name: string }>
): CodewordsSpymasterStat[] {
  const spymasters = roles.filter((r) => r.role === 'spymaster')
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const clueGroups = new Map<string, CodewordsGuess[]>()

  for (const guess of guesses) {
    if (!guess.clue_word) continue
    const key = `${guess.team}:${guess.clue_word}:${guess.clue_number}`
    const list = clueGroups.get(key) ?? []
    list.push(guess)
    clueGroups.set(key, list)
  }

  const stats = new Map<string, CodewordsSpymasterStat>()
  for (const spy of spymasters) {
    stats.set(spy.player_id, {
      playerId: spy.player_id,
      name: nameById.get(spy.player_id) ?? 'Unknown',
      team: spy.team,
      score: 0,
      cluesGiven: 0,
      wordsFound: 0,
    })
  }

  for (const [key, group] of clueGroups) {
    const team = key.split(':')[0] as CodewordsTeam
    const spy = spymasters.find((s) => s.team === team)
    if (!spy) continue
    const stat = stats.get(spy.player_id)
    if (!stat) continue
    stat.cluesGiven += 1
    const found = group.filter((g) => g.cell_type === team).length
    stat.wordsFound += found
    stat.score += found * 5
  }

  return Array.from(stats.values()).sort((a, b) => b.score - a.score || b.wordsFound - a.wordsFound)
}

/** Prefer the winning team's spymaster; fall back to top clue stats when there is no winner. */
export function pickBestCodewordsSpymaster(
  stats: CodewordsSpymasterStat[],
  winner?: CodewordsTeam | null
): CodewordsSpymasterStat | null {
  if (stats.length === 0) return null
  if (winner) {
    const winningSpy = stats.find((s) => s.team === winner)
    if (winningSpy) return winningSpy
  }
  return stats[0] ?? null
}

export type CodewordsHostMode = 'spectator' | 'player'

function codewordsHostModeKey(gameCode: string) {
  return `codewords-host-mode-${gameCode.toUpperCase()}`
}

export function getCodewordsHostMode(gameCode: string): CodewordsHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(codewordsHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setCodewordsHostMode(gameCode: string, mode: CodewordsHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(codewordsHostModeKey(gameCode), mode)
}

export async function clearCodewordsChat(supabase: SupabaseClient, gameId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('codewords_messages').delete().eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('codewords', error) }
  return { error: null }
}

export async function finishCodewordsGame(supabase: SupabaseClient, gameId: string): Promise<{ error: string | null }> {
  const { error: gameError } = await markGameFinished(supabase, gameId)
  if (gameError) return { error: internalErrorMessage('codewords', gameError) }

  const { error: chatError } = await clearCodewordsChat(supabase, gameId)
  if (chatError) return { error: chatError }

  return { error: null }
}

export async function clearCodewordsRoundData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const tables = ['codewords_messages', 'codewords_guesses', 'codewords_boards'] as const
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: internalErrorMessage('codewords', error) }
  }
  return { error: null }
}

export function codewordsAllowsPlayerChanges(status: string): boolean {
  return status === 'waiting' || status === 'active'
}

/** True when the host lobby is open (waiting, or reopening after play again). */
export function codewordsInLobby(status: string, board: Pick<CodewordsBoard, 'id'> | null | undefined): boolean {
  if (status === 'waiting') return true
  if (!board) return status === 'active'
  return false
}

export async function removeCodewordsPlayerRole(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('codewords_player_roles')
    .delete()
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (error) return { error: internalErrorMessage('codewords', error) }
  return { error: null }
}

export async function removeCodewordsPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('codewords', error) }
  return { error: null }
}

export type CodewordsRemovalOutcome = {
  /** The game was force-ended because a team can no longer field a spymaster + operative. */
  ended: boolean
  /** When ended by forfeit, the team that wins by default. */
  forfeitWinner?: CodewordsTeam
  /** When an operative was auto-promoted to fill the vacated spymaster seat. */
  promotedPlayerId?: string
}

/**
 * Keep an in-progress Codewords round playable after a player leaves or is removed.
 *
 * A team needs exactly one spymaster and at least one operative. When the departing
 * player breaks that:
 *  - team has no operatives left → the other team wins by forfeit (round ends)
 *  - spymaster left and only one operative remains → round ends (promoting would
 *    leave nobody to guess)
 *  - spymaster left and ≥2 operatives remain → randomly promote one to spymaster
 *
 * No-op while the game is still in the lobby (no board yet) or already decided.
 * The role row itself is removed by the players FK cascade; this only reconciles
 * what's left. Call AFTER the player row is deleted.
 */
export async function reconcileCodewordsTeamAfterRemoval(
  supabase: SupabaseClient,
  gameId: string,
  removedTeam: CodewordsTeam | null
): Promise<{ error: string | null; outcome: CodewordsRemovalOutcome }> {
  const noop: CodewordsRemovalOutcome = { ended: false }
  if (!removedTeam) return { error: null, outcome: noop }

  const code = gameId.toUpperCase()
  const { data: board, error: boardError } = await supabase
    .from('codewords_boards')
    .select('id, winner')
    .eq('game_id', code)
    .maybeSingle()
  if (boardError) return { error: internalErrorMessage('codewords', boardError), outcome: noop }
  // No board = still in the lobby; a winner = round already over. Nothing to repair.
  if (!board || (board as Pick<CodewordsBoard, 'winner'>).winner) return { error: null, outcome: noop }

  const { data: roleRows, error: rolesError } = await supabase
    .from('codewords_player_roles')
    .select('player_id, team, role')
    .eq('game_id', code)
    .eq('team', removedTeam)
  if (rolesError) return { error: internalErrorMessage('codewords', rolesError), outcome: noop }

  const teamRoles = (roleRows as Array<Pick<CodewordsPlayerRole, 'player_id' | 'team' | 'role'>>) ?? []
  const spymasters = teamRoles.filter((r) => r.role === 'spymaster')
  const operatives = teamRoles.filter((r) => r.role === 'operative')
  const otherTeam: CodewordsTeam = removedTeam === 'red' ? 'blue' : 'red'

  const forfeit = async (): Promise<{ error: string | null; outcome: CodewordsRemovalOutcome }> => {
    const { error: winError } = await supabase
      .from('codewords_boards')
      .update({ winner: otherTeam })
      .eq('game_id', code)
      .is('winner', null)
    if (winError) return { error: internalErrorMessage('codewords', winError), outcome: noop }
    const { error: finishError } = await finishCodewordsGame(supabase, code)
    if (finishError) return { error: finishError, outcome: noop }
    return { error: null, outcome: { ended: true, forfeitWinner: otherTeam } }
  }

  // No operatives left → nobody can guess for this team.
  if (operatives.length === 0) return forfeit()

  // Spymaster seat is empty (the departing player held it).
  if (spymasters.length === 0) {
    // Only one operative — promoting them would leave nobody to guess.
    if (operatives.length === 1) return forfeit()
    // Promote a random operative to spymaster so the round can continue.
    const promoted = shuffle(operatives)[0]
    const { error: promoteError } = await supabase
      .from('codewords_player_roles')
      .update({ role: 'spymaster' })
      .eq('game_id', code)
      .eq('player_id', promoted.player_id)
    if (promoteError) return { error: internalErrorMessage('codewords', promoteError), outcome: noop }
    return { error: null, outcome: { ended: false, promotedPlayerId: promoted.player_id } }
  }

  return { error: null, outcome: noop }
}

/** Clears board, guesses, and team assignments — use only for a full session reset. */
export async function clearCodewordsSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { error: roundError } = await clearCodewordsRoundData(supabase, gameId)
  if (roundError) return { error: roundError }
  const { error } = await supabase.from('codewords_player_roles').delete().eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('codewords', error) }
  return { error: null }
}

/**
 * Fold a realtime `codewords_boards` payload into the board we already hold.
 *
 * Since 20260803170000, anon realtime payloads exclude the `key` column (the role can't select
 * it), so applying `p.new` verbatim would wipe the key a spymaster fetched through
 * /api/codewords/board and blank their grid mid-game. The key never changes for a given board
 * row, so carrying the known one forward is correct — and when the board row itself is replaced
 * (a new round), the id differs and the caller re-fetches instead.
 */
export function mergeCodewordsBoardUpdate(
  prev: CodewordsBoard | null,
  incoming: CodewordsBoard | null
): CodewordsBoard | null {
  if (!incoming) return null
  if (!prev || prev.id !== incoming.id) return incoming
  const hasKey = Array.isArray(incoming.key) && incoming.key.some((cell) => cell != null)
  return {
    ...incoming,
    key: hasKey ? incoming.key : prev.key,
    key_totals: incoming.key_totals ?? prev.key_totals,
  }
}
