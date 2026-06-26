import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { DescribeItSession, DescribeItWord, Game } from '@/types'
import { DESCRIBE_IT_WORD_POOL, parseStoredDescribeItWords, pickDescribeWord } from '@/lib/describe-it-words'

export const DESCRIBE_IT_MIN_PLAYERS = 4
export const DESCRIBE_IT_MAX_PLAYERS = 20
export const DESCRIBE_IT_DEFAULT_MAX_PLAYERS = 12

export const DESCRIBE_IT_TEAM_OPTIONS = [2, 3, 4] as const
// Up to 10 so big teams can give everyone a turn to describe (describer rotates each round).
export const DESCRIBE_IT_ROUND_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 10] as const
export const DESCRIBE_IT_TURN_OPTIONS = [60, 90, 120] as const
export const DESCRIBE_IT_MAX_PLAYER_OPTIONS = [6, 8, 10, 12, 16, 20] as const
export const DESCRIBE_IT_DEFAULT_TURN_SECONDS = 90
export const DESCRIBE_IT_DEFAULT_ROUNDS = 3
/** Players needed per team (a describer + at least one guesser). */
export const DESCRIBE_IT_MIN_PER_TEAM = 2
/** Short gap shown between turns. */
export const DESCRIBE_IT_BREAK_SECONDS = 6

export function clampDescribeItTeams(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_TEAM_OPTIONS as readonly number[]).includes(n) ? n : 2
}

export function clampDescribeItRounds(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_ROUND_OPTIONS as readonly number[]).includes(n) ? n : DESCRIBE_IT_DEFAULT_ROUNDS
}

export function clampDescribeItTurnSeconds(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_TURN_OPTIONS as readonly number[]).includes(n) ? n : DESCRIBE_IT_DEFAULT_TURN_SECONDS
}

export function clampDescribeItMaxPlayers(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return DESCRIBE_IT_DEFAULT_MAX_PLAYERS
  return Math.min(DESCRIBE_IT_MAX_PLAYERS, Math.max(DESCRIBE_IT_MIN_PLAYERS, n))
}

export const TEAM_NAMES = ['Team 1', 'Team 2', 'Team 3', 'Team 4'] as const
export const TEAM_EMOJI = ['🟦', '🟥', '🟩', '🟨'] as const

export function teamLabel(team: number): string {
  return TEAM_NAMES[team - 1] ?? `Team ${team}`
}

function deadline(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

/** Loose match: case-insensitive, treating any punctuation/space as a separator. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A clue must not contain the secret word (Taboo rule). */
export function clueContainsWord(clue: string, word: string): boolean {
  const c = normalizeGuess(clue)
  const w = normalizeGuess(word)
  if (!w) return false
  return c === w || c.split(' ').includes(w) || c.includes(w)
}

export function describeItWordPool(game: Pick<Game, 'question_source' | 'custom_questions'>): readonly string[] {
  if (game.question_source !== 'custom') return DESCRIBE_IT_WORD_POOL
  const custom = parseStoredDescribeItWords(game.custom_questions as unknown)
  if (custom.length === 0) return DESCRIBE_IT_WORD_POOL
  // "Both": built-in bank plus the host's own words.
  const seen = new Set(DESCRIBE_IT_WORD_POOL.map((w) => w.toLowerCase()))
  const merged = [...DESCRIBE_IT_WORD_POOL]
  for (const w of custom) {
    if (!seen.has(w.toLowerCase())) {
      seen.add(w.toLowerCase())
      merged.push(w)
    }
  }
  return merged
}

export function totalDescribeItTurns(numTeams: number, totalRounds: number): number {
  return numTeams * totalRounds
}

export function roundForTurn(turnIndex: number, numTeams: number): number {
  return Math.floor(turnIndex / numTeams) + 1
}

export function teamForTurn(turnIndex: number, numTeams: number): number {
  return (turnIndex % numTeams) + 1
}

/** Team rosters in stable join order, keyed by team number. */
export function teamRoster(rows: Array<{ player_id: string; team: number }>): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const list = map.get(r.team) ?? []
    list.push(r.player_id)
    map.set(r.team, list)
  }
  return map
}

/** Describer for a team's turn — rotates each round so everyone gets a go. */
export function describerForTurn(members: string[], round: number): string | null {
  if (members.length === 0) return null
  return members[(round - 1) % members.length] ?? members[0] ?? null
}

/** Lobby is ready when every configured team has at least the minimum members. */
export function describeItLobbyReady(
  rows: Array<{ player_id: string; team: number }>,
  numTeams: number
): { ok: boolean; error?: string } {
  const roster = teamRoster(rows)
  for (let team = 1; team <= numTeams; team += 1) {
    const size = roster.get(team)?.length ?? 0
    if (size < DESCRIBE_IT_MIN_PER_TEAM) {
      return { ok: false, error: `${teamLabel(team)} needs at least ${DESCRIBE_IT_MIN_PER_TEAM} players` }
    }
  }
  return { ok: true }
}

/** Auto-distribute any players that haven't picked a team onto the smallest teams. */
export function balanceDescribeItTeams(
  playerIds: string[],
  existing: Array<{ player_id: string; team: number }>,
  numTeams: number
): Map<string, number> {
  const assignment = new Map<string, number>()
  const counts = new Array(numTeams + 1).fill(0)
  for (const row of existing) {
    if (row.team >= 1 && row.team <= numTeams && playerIds.includes(row.player_id)) {
      assignment.set(row.player_id, row.team)
      counts[row.team] += 1
    }
  }
  for (const id of playerIds) {
    if (assignment.has(id)) continue
    let smallest = 1
    for (let t = 2; t <= numTeams; t += 1) if (counts[t] < counts[smallest]) smallest = t
    assignment.set(id, smallest)
    counts[smallest] += 1
  }
  return assignment
}

/** Auto-assign a late-joining player to the team with the fewest members. */
export async function assignDescribeItLateJoinTeam(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ team: number; error?: string }> {
  const { data: game } = await supabase.from('games').select('describe_it_num_teams').eq('id', gameId).maybeSingle()
  const numTeams = clampDescribeItTeams(game?.describe_it_num_teams)
  const rows = await loadTeamRows(supabase, gameId)
  const counts = new Array(numTeams + 1).fill(0)
  for (const r of rows) if (r.team >= 1 && r.team <= numTeams) counts[r.team] += 1
  let smallest = 1
  for (let t = 2; t <= numTeams; t += 1) if (counts[t] < counts[smallest]) smallest = t

  const { error } = await supabase
    .from('describe_it_players')
    .upsert({ game_id: gameId, player_id: playerId, team: smallest }, { onConflict: 'game_id,player_id' })
  if (error) return { team: smallest, error: error.message }
  return { team: smallest }
}

/** Words used across previous rounds (carried between Play again games). */
function readUsedFromPoolUsage(poolUsage: unknown): string[] {
  if (!poolUsage || typeof poolUsage !== 'object') return []
  const arr = (poolUsage as Record<string, unknown>).describe_it_used
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
}

function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: DescribeItSession | null; error?: string }> {
  const { data, error } = await supabase.from('describe_it_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: error.message }
  return { session: data as DescribeItSession | null }
}

async function loadTeamRows(
  supabase: SupabaseClient,
  gameId: string
): Promise<Array<{ player_id: string; team: number }>> {
  const { data } = await supabase
    .from('describe_it_players')
    .select('player_id, team')
    .eq('game_id', gameId)
    .order('created_at')
  return (data ?? []) as Array<{ player_id: string; team: number }>
}

async function playerName(supabase: SupabaseClient, gameId: string, playerId: string | null): Promise<string> {
  if (!playerId) return 'Player'
  const { data } = await supabase.from('players').select('name').eq('id', playerId).maybeSingle()
  return data?.name ?? 'Player'
}

/** Build the session fields for the turn at `turnIndex` (or null if the match is over). */
function buildTurn(
  turnIndex: number,
  numTeams: number,
  totalRounds: number,
  turnSeconds: number,
  roster: Map<number, string[]>,
  pool: readonly string[],
  usedWords: string[]
): Partial<DescribeItSession> | null {
  if (turnIndex >= totalDescribeItTurns(numTeams, totalRounds)) return null
  const round = roundForTurn(turnIndex, numTeams)
  const activeTeam = teamForTurn(turnIndex, numTeams)
  const describer = describerForTurn(roster.get(activeTeam) ?? [], round)
  const word = pickDescribeWord(pool, usedWords)
  return {
    phase: 'turn',
    turn_index: turnIndex,
    current_round: round,
    active_team: activeTeam,
    describer_player_id: describer,
    current_word: word,
    current_clue: null,
    current_clues: [],
    used_words: [...usedWords, word],
    turn_deadline_at: deadline(turnSeconds),
    break_deadline_at: null,
  }
}

export async function initializeDescribeItGame(
  supabase: SupabaseClient,
  gameId: string,
  _playerIds: string[]
): Promise<{ error?: string }> {
  const { data: game } = await supabase
    .from('games')
    .select('describe_it_num_teams, rounds_count, timer_seconds, question_source, custom_questions, pool_usage')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { error: 'Game not found' }

  const numTeams = clampDescribeItTeams(game.describe_it_num_teams)
  const totalRounds = clampDescribeItRounds(game.rounds_count)
  const turnSeconds = clampDescribeItTurnSeconds(game.timer_seconds)

  const teamRows = await loadTeamRows(supabase, gameId)
  const ready = describeItLobbyReady(teamRows, numTeams)
  if (!ready.ok) return { error: ready.error }

  const roster = teamRoster(teamRows)
  const pool = describeItWordPool(game as Pick<Game, 'question_source' | 'custom_questions'>)

  // Carry word usage across Play again so each new game prefers fresh words.
  // Once every word in the current pool has been used, start a new cycle.
  const poolKeys = new Set(pool.map((w) => w.toLowerCase()))
  let priorUsed = readUsedFromPoolUsage(game.pool_usage).filter((w) => poolKeys.has(w.toLowerCase()))
  if (priorUsed.length >= pool.length) priorUsed = []

  const firstTurn = buildTurn(0, numTeams, totalRounds, turnSeconds, roster, pool, priorUsed)
  if (!firstTurn) return { error: 'Could not start the match' }

  const row = {
    num_teams: numTeams,
    total_rounds: totalRounds,
    turn_seconds: turnSeconds,
    status: 'active' as const,
    status_message: `${teamLabel(firstTurn.active_team!)} is up first`,
    ...firstTurn,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('describe_it_sessions')
    .select('id')
    .eq('game_id', gameId)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('describe_it_sessions').update(row).eq('game_id', gameId)
    : await supabase.from('describe_it_sessions').insert({ ...row, game_id: gameId })
  if (error) return { error: error.message }
  return {}
}

export async function processDescribeItClue(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  clue: string
): Promise<{ error?: string }> {
  const { session, error } = await loadSession(supabase, gameId)
  if (error) return { error }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.describer_player_id !== playerId) return { error: 'Only the describer can give a clue' }
  const trimmed = clue.trim()
  if (!trimmed) return { error: 'Clue is empty' }
  if (session.current_word && clueContainsWord(trimmed, session.current_word)) {
    return { error: "Your clue can't contain the word" }
  }
  // Avoid logging the exact same clue twice in a row.
  const history = session.current_clues ?? []
  const nextClues = history.some((c) => normalizeGuess(c) === normalizeGuess(trimmed)) ? history : [...history, trimmed]

  const { error: updateError } = await supabase
    .from('describe_it_sessions')
    .update({ current_clue: trimmed, current_clues: nextClues, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
  if (updateError) return { error: updateError.message }
  return {}
}

export async function processDescribeItGuess(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  text: string
): Promise<{ error?: string; correct?: boolean }> {
  const { session, error } = await loadSession(supabase, gameId)
  if (error) return { error }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.describer_player_id === playerId) return { error: "The describer can't guess" }

  const teamRows = await loadTeamRows(supabase, gameId)
  const mine = teamRows.find((r) => r.player_id === playerId)
  if (!mine) return { error: 'You are not in this game' }
  if (mine.team !== session.active_team) return { error: "It's not your team's turn" }

  const guess = text.trim()
  if (!guess) return { error: 'Guess is empty' }
  const correct = !!session.current_word && normalizeGuess(guess) === normalizeGuess(session.current_word)

  await supabase.from('describe_it_guesses').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    player_id: playerId,
    team: mine.team,
    text: guess.slice(0, 80),
    correct,
  })

  if (!correct) return { correct: false }

  const { data: game } = await supabase
    .from('games')
    .select('question_source, custom_questions')
    .eq('id', gameId)
    .maybeSingle()
  const pool = describeItWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)
  const nextWord = pickDescribeWord(pool, session.used_words)
  const name = await playerName(supabase, gameId, playerId)

  // Atomically "claim" the word by advancing it only while it's still the word
  // being guessed. If two teammates guess at once, only one update matches a row
  // (Postgres re-checks the WHERE after locking) — the other scores nothing.
  const { data: claimed } = await supabase
    .from('describe_it_sessions')
    .update({
      current_word: nextWord,
      current_clue: null,
      current_clues: [],
      used_words: [...session.used_words, nextWord],
      status_message: `${name} guessed it!`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('current_word', session.current_word)
    .select('id')

  if (!claimed || claimed.length === 0) {
    // Someone else already got this word — a correct but late guess scores nothing.
    return { correct: true }
  }

  await supabase.from('describe_it_words').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: session.active_team,
    describer_player_id: session.describer_player_id,
    word: session.current_word,
    clue: session.current_clue,
    status: 'guessed',
    guesser_player_id: playerId,
  })

  return { correct: true }
}

export async function processDescribeItSkip(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, error } = await loadSession(supabase, gameId)
  if (error) return { error }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.describer_player_id !== playerId) return { error: 'Only the describer can skip' }
  if (!session.current_word) return {}

  const { data: game } = await supabase
    .from('games')
    .select('question_source, custom_questions')
    .eq('id', gameId)
    .maybeSingle()
  const pool = describeItWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)
  const nextWord = pickDescribeWord(pool, session.used_words)

  // Same atomic claim as a guess, so a skip can't skip a word that was just
  // guessed (or double-log) if a guess landed at the same moment.
  const { data: claimed } = await supabase
    .from('describe_it_sessions')
    .update({
      current_word: nextWord,
      current_clue: null,
      current_clues: [],
      used_words: [...session.used_words, nextWord],
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('current_word', session.current_word)
    .select('id')

  if (!claimed || claimed.length === 0) return {}

  await supabase.from('describe_it_words').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: session.active_team,
    describer_player_id: session.describer_player_id,
    word: session.current_word,
    clue: session.current_clue,
    status: 'skipped',
    guesser_player_id: null,
  })
  return {}
}

/** Turn timer ran out — move into the short break before the next team. */
export async function processDescribeItExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  const { session, error } = await loadSession(supabase, gameId)
  if (error) return { error }
  if (!session || session.status === 'finished') return {}
  if (session.phase !== 'turn') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const { count } = await supabase
    .from('describe_it_words')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('status', 'guessed')

  const last = totalDescribeItTurns(session.num_teams, session.total_rounds) - 1
  const isLastTurn = session.turn_index >= last

  const { error: updateError } = await supabase
    .from('describe_it_sessions')
    .update({
      phase: 'break',
      turn_deadline_at: null,
      break_deadline_at: deadline(DESCRIBE_IT_BREAK_SECONDS),
      current_clue: null,
      status_message: `${teamLabel(session.active_team)} got ${count ?? 0} ${(count ?? 0) === 1 ? 'word' : 'words'}${isLastTurn ? '' : ' — next team up soon'}`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (updateError) return { error: updateError.message }
  return {}
}

/** Break finished (or host skipped it) — start the next turn or end the match. */
export async function processDescribeItAdvance(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<{ error?: string }> {
  const { session, error } = await loadSession(supabase, gameId)
  if (error) return { error }
  if (!session || session.status === 'finished') return {}
  if (session.phase !== 'break') return {}
  if (!opts?.force && (!session.break_deadline_at || new Date(session.break_deadline_at).getTime() > Date.now())) {
    return {}
  }

  const nextIndex = session.turn_index + 1
  const teamRows = await loadTeamRows(supabase, gameId)
  const roster = teamRoster(teamRows)
  const { data: game } = await supabase
    .from('games')
    .select('question_source, custom_questions')
    .eq('id', gameId)
    .maybeSingle()
  const pool = describeItWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)

  const nextTurn = buildTurn(
    nextIndex,
    session.num_teams,
    session.total_rounds,
    session.turn_seconds,
    roster,
    pool,
    session.used_words
  )

  if (!nextTurn) {
    const { error: finishError } = await supabase
      .from('describe_it_sessions')
      .update({
        phase: 'finished',
        status: 'finished',
        turn_deadline_at: null,
        break_deadline_at: null,
        status_message: 'Final results',
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (finishError) return { error: finishError.message }
    await markGameFinished(supabase, gameId)
    return {}
  }

  const { error: updateError } = await supabase
    .from('describe_it_sessions')
    .update({
      ...nextTurn,
      status_message: `${teamLabel(nextTurn.active_team!)} is up`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (updateError) return { error: updateError.message }
  return {}
}

export type DescribeItTeamScore = { team: number; score: number }

/** Team scores = number of words guessed, highest first. */
export function computeDescribeItScores(
  words: Pick<DescribeItWord, 'team' | 'status'>[],
  numTeams: number
): DescribeItTeamScore[] {
  const counts = new Map<number, number>()
  for (let t = 1; t <= numTeams; t += 1) counts.set(t, 0)
  for (const w of words) {
    if (w.status === 'guessed') counts.set(w.team, (counts.get(w.team) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([team, score]) => ({ team, score }))
    .sort((a, b) => b.score - a.score || a.team - b.team)
}

export function describeItWinningTeams(scores: DescribeItTeamScore[]): number[] {
  if (scores.length === 0) return []
  const top = scores[0]!.score
  if (top === 0) return []
  return scores.filter((s) => s.score === top).map((s) => s.team)
}

export function isDescribeItResultsPhase(
  gameStatus: string | undefined,
  session: Pick<DescribeItSession, 'status' | 'phase'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.phase === 'finished'
}

export function describeItInLobby(
  gameStatus: string | undefined,
  session: Pick<DescribeItSession, 'id'> | null | undefined
): boolean {
  if (gameStatus === 'waiting') return true
  return gameStatus === 'active' && !session
}

export async function canDescribeItPlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false
  const { data } = await supabase.from('describe_it_sessions').select('status').eq('game_id', gameId).maybeSingle()
  return data?.status === 'finished'
}

/** Play again — wipe the session, word log, and guesses; keep team assignments. */
export async function clearDescribeItSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  // Remember the words used this game so the next Play again prefers fresh ones.
  const { data: session } = await supabase
    .from('describe_it_sessions')
    .select('used_words')
    .eq('game_id', gameId)
    .maybeSingle()
  const usedThisGame = Array.isArray(session?.used_words) ? (session!.used_words as string[]) : []
  if (usedThisGame.length > 0) {
    const { data: game } = await supabase.from('games').select('pool_usage').eq('id', gameId).maybeSingle()
    const prior = readUsedFromPoolUsage(game?.pool_usage)
    const merged = dedupeWords([...prior, ...usedThisGame])
    const poolUsage =
      game?.pool_usage && typeof game.pool_usage === 'object' ? (game.pool_usage as Record<string, unknown>) : {}
    await supabase
      .from('games')
      .update({ pool_usage: { ...poolUsage, describe_it_used: merged } })
      .eq('id', gameId)
  }

  await supabase.from('describe_it_guesses').delete().eq('game_id', gameId)
  await supabase.from('describe_it_words').delete().eq('game_id', gameId)
  await supabase.from('describe_it_sessions').delete().eq('game_id', gameId)
  return {}
}
