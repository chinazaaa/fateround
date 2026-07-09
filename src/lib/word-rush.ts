import type { Game, WordRushAnswer, WordRushMode, WordRushPromptMode, WordRushSession } from '@/types'
import { WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'

export const WORD_RUSH_MIN_PLAYERS = 4
export const WORD_RUSH_MIN_PLAYERS_INDIVIDUAL = 2
export const WORD_RUSH_MAX_PLAYERS = 20
export const WORD_RUSH_DEFAULT_MAX_PLAYERS = 12

export const WORD_RUSH_TEAM_OPTIONS = [2, 3, 4] as const
export const WORD_RUSH_TURN_OPTIONS = [60, 90, 120, 180] as const
export const WORD_RUSH_ROUND_OPTIONS = [3, 5, 7, 10] as const
export const WORD_RUSH_MAX_PLAYER_OPTIONS = [6, 8, 10, 12, 16, 20] as const

export const WORD_RUSH_DEFAULT_TURN_SECONDS = 120
export const WORD_RUSH_DEFAULT_ROUNDS = 5
/** Individual mode: flat points before the speed bonus (Text Charades style). */
export const WORD_RUSH_INDIVIDUAL_BASE_POINTS = 10
/** Individual mode: extra points for an instant answer, decaying to 0 at time-up. */
export const WORD_RUSH_INDIVIDUAL_SPEED_BONUS = 40
export const WORD_RUSH_MIN_PER_TEAM = 1
export const WORD_RUSH_BREAK_SECONDS = 6
export const WORD_RUSH_ROUND_RESULTS_SECONDS = 8

export const WORD_RUSH_MIN_WORD_LENGTH = WORD_HUNT_MIN_WORD_LENGTH
export const WORD_RUSH_MAX_WORD_LENGTH = 12

export const TEAM_NAMES = ['Team 1', 'Team 2', 'Team 3', 'Team 4'] as const
export const TEAM_EMOJI = ['🟦', '🟥', '🟩', '🟨'] as const

export function normalizeWordRushWord(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export function wordMatchesLetters(word: string, startLetter: string, endLetter: string): boolean {
  const normalized = normalizeWordRushWord(word)
  if (normalized.length < WORD_RUSH_MIN_WORD_LENGTH) return false
  return normalized[0] === startLetter.toLowerCase() && normalized[normalized.length - 1] === endLetter.toLowerCase()
}

export function letterPairKey(start: string, end: string): string {
  return `${start.toLowerCase()}-${end.toLowerCase()}`
}

export function teamLabel(team: number): string {
  return TEAM_NAMES[team - 1] ?? `Team ${team}`
}

export function clampWordRushMode(value: unknown): WordRushMode {
  return value === 'individual' ? 'individual' : 'team'
}

export function clampWordRushPromptMode(value: unknown): WordRushPromptMode {
  return value === 'manual' ? 'manual' : 'automatic'
}

export function clampWordRushTeams(value: unknown): number {
  const n = Number(value)
  return (WORD_RUSH_TEAM_OPTIONS as readonly number[]).includes(n) ? n : 2
}

export function clampWordRushRounds(value: unknown): number {
  const n = Number(value)
  return (WORD_RUSH_ROUND_OPTIONS as readonly number[]).includes(n) ? n : WORD_RUSH_DEFAULT_ROUNDS
}

export function clampWordRushTurnSeconds(value: unknown): number {
  const n = Number(value)
  return (WORD_RUSH_TURN_OPTIONS as readonly number[]).includes(n) ? n : WORD_RUSH_DEFAULT_TURN_SECONDS
}

/** Speed-scaled points for a correct individual-mode answer at a given moment. */
export function wordRushIndividualGuessPointsAt(
  turnDeadlineAt: string | null,
  turnSeconds: number,
  atMs: number
): number {
  if (!turnDeadlineAt) return WORD_RUSH_INDIVIDUAL_BASE_POINTS
  const totalMs = Math.max(turnSeconds, 1) * 1000
  const startMs = new Date(turnDeadlineAt).getTime() - totalMs
  const elapsed = Math.max(0, atMs - startMs)
  const ratio = Math.max(0, Math.min(1, 1 - elapsed / totalMs))
  return WORD_RUSH_INDIVIDUAL_BASE_POINTS + Math.floor(WORD_RUSH_INDIVIDUAL_SPEED_BONUS * ratio)
}

/** Speed-scaled points for a correct individual-mode answer (uses current time). */
export function wordRushIndividualGuessPoints(turnDeadlineAt: string | null, turnSeconds: number): number {
  return wordRushIndividualGuessPointsAt(turnDeadlineAt, turnSeconds, Date.now())
}

export function formatWordRushTurnTimer(seconds: number): string {
  if (seconds === 60) return '1 min'
  if (seconds === 90) return '1.5 min'
  if (seconds === 120) return '2 min'
  if (seconds === 180) return '3 min'
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds}s`
}

export function clampWordRushMaxPlayers(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return WORD_RUSH_DEFAULT_MAX_PLAYERS
  return Math.min(WORD_RUSH_MAX_PLAYERS, Math.max(WORD_RUSH_MIN_PLAYERS_INDIVIDUAL, n))
}

export type WordRushTeamScore = { team: number; score: number }
export type WordRushPlayerScore = { id: string; name: string; score: number }

export function teamRoster(rows: Array<{ player_id: string; team: number }>): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const list = map.get(r.team) ?? []
    list.push(r.player_id)
    map.set(r.team, list)
  }
  return map
}

export function teamForTurnIndex(turnIndex: number, numTeams: number): number {
  return (turnIndex % numTeams) + 1
}

export function promptSetterForIndividualRound(roster: string[], roundIndex: number): string | null {
  if (roster.length === 0) return null
  return roster[roundIndex % roster.length] ?? null
}

export function isWordRushResultsPhase(
  gameStatus: string | undefined,
  session: Pick<WordRushSession, 'phase' | 'status'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.phase === 'finished'
}

export function computeWordRushTeamScores(
  answers: Pick<WordRushAnswer, 'team' | 'correct' | 'team_turn_index'>[],
  numTeams: number
): WordRushTeamScore[] {
  const counts = new Map<number, number>()
  for (let t = 1; t <= numTeams; t++) counts.set(t, 0)
  for (const a of answers) {
    if (!a.correct) continue
    counts.set(a.team, (counts.get(a.team) ?? 0) + 1)
  }
  return [...counts.entries()].map(([team, score]) => ({ team, score })).sort((a, b) => b.score - a.score)
}

export function computeWordRushPlayerScores(
  players: Array<{ id: string; name: string }>,
  teamRows: Array<{ player_id: string; score: number }>
): WordRushPlayerScore[] {
  const scoreById = new Map(teamRows.map((r) => [r.player_id, r.score]))
  return players
    .map((p) => ({ id: p.id, name: p.name, score: scoreById.get(p.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
}

export function allWordRushIndividualPlayersSubmitted(
  session: Pick<WordRushSession, 'roster' | 'prompt_mode' | 'prompt_setter_player_id' | 'turn_index'>,
  answers: Pick<WordRushAnswer, 'player_id' | 'turn_index'>[]
): boolean {
  const eligible = wordRushIndividualAnswerers(session)
  if (eligible.length === 0) return false
  const submitted = new Set(
    answers.filter((a) => a.turn_index === session.turn_index).map((a) => a.player_id)
  )
  return eligible.every((id) => submitted.has(id))
}

export function wordRushIndividualAnswerers(
  session: Pick<WordRushSession, 'roster' | 'prompt_setter_player_id'>
): string[] {
  const roster = session.roster ?? []
  if (session.prompt_setter_player_id) {
    return roster.filter((id) => id !== session.prompt_setter_player_id)
  }
  return roster
}

export function wordRushLobbyReady(
  teamRows: Array<{ player_id: string; team: number }>,
  numTeams: number,
  mode: WordRushMode
): { ok: true } | { ok: false; error: string } {
  if (mode === 'individual') return { ok: true }
  const roster = teamRoster(teamRows)
  for (let t = 1; t <= numTeams; t++) {
    const members = roster.get(t) ?? []
    if (members.length < WORD_RUSH_MIN_PER_TEAM) {
      return { ok: false, error: `${teamLabel(t)} needs at least ${WORD_RUSH_MIN_PER_TEAM} player` }
    }
  }
  return { ok: true }
}

export function balanceWordRushTeams(
  playerIds: string[],
  existing: Array<{ player_id: string; team: number }>,
  numTeams: number
): Map<string, number> {
  const assignment = new Map<string, number>()
  for (const row of existing) assignment.set(row.player_id, row.team)
  const counts = new Array(numTeams).fill(0)
  for (const team of assignment.values()) counts[team - 1] += 1
  for (const id of playerIds) {
    if (assignment.has(id)) continue
    let minTeam = 1
    for (let t = 2; t <= numTeams; t++) {
      if (counts[t - 1] < counts[minTeam - 1]) minTeam = t
    }
    assignment.set(id, minTeam)
    counts[minTeam - 1] += 1
  }
  return assignment
}

function shuffleIds<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Even out teams in the lobby — same approach as Text Charades. */
export function rebalanceWordRushTeams(
  playerIds: string[],
  existing: Array<{ player_id: string; team: number }>,
  numTeams: number
): Map<string, number> {
  const assignment = new Map<string, number>()
  const counts = new Array(numTeams + 1).fill(0)
  const members: string[][] = Array.from({ length: numTeams + 1 }, () => [])
  for (const row of existing) {
    if (row.team >= 1 && row.team <= numTeams && playerIds.includes(row.player_id)) {
      assignment.set(row.player_id, row.team)
      counts[row.team] += 1
      members[row.team]!.push(row.player_id)
    }
  }
  for (const id of playerIds) {
    if (assignment.has(id)) continue
    let smallest = 1
    for (let t = 2; t <= numTeams; t += 1) if (counts[t]! < counts[smallest]!) smallest = t
    assignment.set(id, smallest)
    counts[smallest] += 1
    members[smallest]!.push(id)
  }
  for (let guard = 0; guard < playerIds.length; guard += 1) {
    let big = 1
    let small = 1
    for (let t = 2; t <= numTeams; t += 1) {
      if (counts[t]! > counts[big]!) big = t
      if (counts[t]! < counts[small]!) small = t
    }
    if (counts[big]! - counts[small]! <= 1) break
    const mover = members[big]!.pop()
    if (mover == null) break
    assignment.set(mover, small)
    counts[big] -= 1
    counts[small] += 1
    members[small]!.push(mover)
  }
  return assignment
}

/** Randomly assign every player to a team (Codewords-style shuffle). */
export function shuffleWordRushTeams(playerIds: string[], numTeams: number): Map<string, number> {
  const shuffled = shuffleIds(playerIds)
  const assignment = new Map<string, number>()
  shuffled.forEach((id, index) => {
    assignment.set(id, (index % numTeams) + 1)
  })
  return assignment
}

export function canWordRushPlayAgain(game: Pick<Game, 'status'>): boolean {
  return game.status === 'waiting' || game.status === 'finished'
}

export function tallyWordRushScores(
  mode: WordRushMode,
  players: Array<{ id: string; name: string }>,
  teamRows: Array<{ player_id: string; team: number; score: number }>,
  answers: Pick<WordRushAnswer, 'team' | 'correct' | 'team_turn_index'>[],
  numTeams: number
): WordRushTeamScore[] | WordRushPlayerScore[] {
  if (mode === 'individual') return computeWordRushPlayerScores(players, teamRows)
  return computeWordRushTeamScores(answers, numTeams)
}
