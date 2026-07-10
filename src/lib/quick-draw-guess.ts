import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage, internalFailure } from '@/lib/api-errors'
import { markGameFinished } from '@/lib/game-finish'
import { parseStoredMltQuestions } from '@/lib/custom-questions'
import { QUICK_DRAW_GUESS_WORD_POOL } from '@/lib/quick-draw-guess-words'
import { pickQuickDrawWord } from '@/lib/quick-draw-prompts'
import { validateStrokeData } from '@/lib/quick-draw'
import {
  DESCRIBE_IT_BREAK_SECONDS,
  DESCRIBE_IT_GUESS_BASE_POINTS,
  DESCRIBE_IT_MIN_PER_TEAM,
  DESCRIBE_IT_TEAM_OPTIONS,
  balanceDescribeItTeams,
  describeItGuessPoints,
  describeItIndividualLeaderboard,
  describeItLobbyReady,
  describeItRoleLeaderboards,
  describerForIndividualTurn,
  describerForTurn,
  nextIndividualDescriberIndex,
  normalizeGuess,
  teamForTurn,
  teamLabel,
  teamRoster,
  type DescribeItPlayerScore,
  type DescribeItTeamScore,
} from '@/lib/describe-it'
import type {
  QuickDrawGuessGuess,
  QuickDrawGuessPlayer,
  QuickDrawGuessSession,
  QuickDrawGuessWord,
  QuickDrawPlayMode,
  Game,
} from '@/types'

export const QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM = 4
export const QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL = 3
export const QUICK_DRAW_GUESS_BREAK_SECONDS = DESCRIBE_IT_BREAK_SECONDS

export { DESCRIBE_IT_TEAM_OPTIONS as QUICK_DRAW_GUESS_TEAM_OPTIONS, teamLabel, TEAM_EMOJI } from '@/lib/describe-it'

export function clampQuickDrawPlayMode(value: unknown): QuickDrawPlayMode {
  return value === 'individual' ? 'individual' : 'team'
}

export function clampQuickDrawNumTeams(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_TEAM_OPTIONS as readonly number[]).includes(n) ? n : 2
}

export function quickDrawGuessTotalTurns(
  mode: QuickDrawPlayMode,
  numTeams: number,
  rosterLen: number,
  totalRounds: number
): number {
  return (mode === 'individual' ? rosterLen : numTeams) * totalRounds
}

export function drawerForIndividualTurn(roster: string[], turnIndex: number): string | null {
  return describerForIndividualTurn(roster, turnIndex)
}

export function drawerForTeamTurn(members: string[], round: number): string | null {
  return describerForTurn(members, round)
}

function deadline(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

function emptyStrokeData() {
  return { width: 400, height: 280, strokes: [] }
}

export function quickDrawGuessWordPool(game: Pick<Game, 'question_source' | 'custom_questions'>): readonly string[] {
  if (game.question_source === 'custom') {
    const custom = parseStoredMltQuestions(game.custom_questions)
    if (custom.length > 0) return custom
  }
  return QUICK_DRAW_GUESS_WORD_POOL
}

function readUsedFromPoolUsage(poolUsage: unknown): string[] {
  if (!poolUsage || typeof poolUsage !== 'object') return []
  const arr = (poolUsage as Record<string, unknown>).quick_draw_guess_used
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503'
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: QuickDrawGuessSession | null; error?: string; internal?: boolean }> {
  const { data, error } = await supabase
    .from('quick_draw_guess_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  if (error) return { session: null, ...internalFailure('quick-draw-guess:loadSession', error) }
  return { session: data as QuickDrawGuessSession | null }
}

async function loadTeamRows(
  supabase: SupabaseClient,
  gameId: string
): Promise<Array<{ player_id: string; team: number; score?: number | null }>> {
  const { data } = await supabase
    .from('quick_draw_guess_players')
    .select('player_id, team, score')
    .eq('game_id', gameId)
    .order('created_at')
  return (data ?? []) as Array<{ player_id: string; team: number; score?: number | null }>
}

async function playerName(supabase: SupabaseClient, gameId: string, playerId: string | null): Promise<string> {
  if (!playerId) return 'Player'
  const { data } = await supabase.from('players').select('name').eq('id', playerId).maybeSingle()
  return data?.name ?? 'Player'
}

function buildTurn(opts: {
  turnIndex: number
  mode: QuickDrawPlayMode
  numTeams: number
  totalRounds: number
  turnSeconds: number
  teamRoster: Map<number, string[]>
  individualRoster: string[]
  primary: readonly string[]
  usedWords: string[]
}): Partial<QuickDrawGuessSession> | null {
  const { turnIndex, mode, numTeams, totalRounds, turnSeconds, teamRoster, individualRoster, primary } = opts
  const units = mode === 'individual' ? individualRoster.length : numTeams
  if (units === 0 || turnIndex >= units * totalRounds) return null

  const round = Math.floor(turnIndex / units) + 1
  const word = pickQuickDrawWord(primary, opts.usedWords)
  const base = {
    phase: 'turn' as const,
    turn_index: turnIndex,
    current_round: round,
    current_word: word,
    current_stroke_data: emptyStrokeData(),
    used_words: [...opts.usedWords, word],
    turn_deadline_at: deadline(turnSeconds),
    break_deadline_at: null,
  }

  if (mode === 'individual') {
    return { ...base, active_team: 0, drawer_player_id: drawerForIndividualTurn(individualRoster, turnIndex) }
  }
  const activeTeam = teamForTurn(turnIndex, numTeams)
  return {
    ...base,
    active_team: activeTeam,
    drawer_player_id: drawerForTeamTurn(teamRoster.get(activeTeam) ?? [], round),
  }
}

export async function initializeQuickDrawGuessGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string; internal?: boolean }> {
  const { data: game } = await supabase
    .from('games')
    .select(
      'quick_draw_play_mode, quick_draw_num_teams, rounds_count, timer_seconds, question_source, custom_questions, pool_usage'
    )
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { error: 'Game not found' }

  const mode = clampQuickDrawPlayMode(game.quick_draw_play_mode)
  const numTeams = clampQuickDrawNumTeams(game.quick_draw_num_teams)
  const totalRounds = Math.max(1, Number(game.rounds_count) || 3)
  const turnSeconds = Math.max(30, Number(game.timer_seconds) || 90)

  let teamRoster_ = new Map<number, string[]>()
  let individualRoster: string[] = []

  if (mode === 'individual') {
    if (playerIds.length < QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL) {
      return { error: `Need at least ${QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL} players to start` }
    }
    individualRoster = playerIds
    const rows = playerIds.map((player_id) => ({ game_id: gameId, player_id, team: 1, score: 0 }))
    const { error: seedError } = await supabase
      .from('quick_draw_guess_players')
      .upsert(rows, { onConflict: 'game_id,player_id' })
    if (seedError) return internalFailure('quick-draw-guess:initialize:seed', seedError)
  } else {
    if (playerIds.length < QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM) {
      return { error: `Need at least ${QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM} players to start` }
    }
    const existingRows = await loadTeamRows(supabase, gameId)
    const assignment = balanceDescribeItTeams(playerIds, existingRows, numTeams)
    const existingIds = new Set(existingRows.map((r) => r.player_id))
    const newRows = [...assignment.entries()]
      .filter(([player_id]) => !existingIds.has(player_id))
      .map(([player_id, team]) => ({ game_id: gameId, player_id, team }))
    if (newRows.length > 0) {
      const { error: assignError } = await supabase
        .from('quick_draw_guess_players')
        .upsert(newRows, { onConflict: 'game_id,player_id' })
      if (assignError) return internalFailure('quick-draw-guess:initialize:assign', assignError)
    }
    const teamRows = newRows.length > 0 ? await loadTeamRows(supabase, gameId) : existingRows
    const ready = describeItLobbyReady(teamRows, numTeams)
    if (!ready.ok) return { error: ready.error }
    teamRoster_ = teamRoster(teamRows)
  }

  const primary = quickDrawGuessWordPool(game as Pick<Game, 'question_source' | 'custom_questions'>)
  const primaryKeys = new Set(primary.map((w) => w.toLowerCase()))
  let priorUsed = readUsedFromPoolUsage(game.pool_usage).filter((w) => primaryKeys.has(w.toLowerCase()))
  if (priorUsed.length >= primary.length) priorUsed = []

  const firstTurn = buildTurn({
    turnIndex: 0,
    mode,
    numTeams,
    totalRounds,
    turnSeconds,
    teamRoster: teamRoster_,
    individualRoster,
    primary,
    usedWords: priorUsed,
  })
  if (!firstTurn) return { error: 'Could not start the match' }

  const firstMessage =
    mode === 'individual'
      ? `${await playerName(supabase, gameId, firstTurn.drawer_player_id ?? null)} draws first`
      : `${teamLabel(firstTurn.active_team!)} draws first`

  const row = {
    mode,
    num_teams: numTeams,
    total_rounds: totalRounds,
    turn_seconds: turnSeconds,
    roster: individualRoster,
    status_message: firstMessage,
    ...firstTurn,
  }

  const { error: sessionError } = await supabase.from('quick_draw_guess_sessions').insert({
    game_id: gameId,
    ...row,
  })
  if (sessionError) return internalFailure('quick-draw-guess:initialize:session', sessionError)

  return {}
}

export async function updateQuickDrawGuessStrokes(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  rawStrokeData: unknown
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.drawer_player_id !== playerId) return { error: 'Only the drawer can update the canvas' }

  const strokeData = validateStrokeData(rawStrokeData) ?? emptyStrokeData()
  const { error: updateError } = await supabase
    .from('quick_draw_guess_sessions')
    .update({ current_stroke_data: strokeData, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('phase', 'turn')
    .eq('turn_index', session.turn_index)
  if (updateError) return internalFailure('quick-draw-guess:strokes', updateError)
  return {}
}

export async function processQuickDrawGuessGuess(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  text: string
): Promise<{ error?: string; correct?: boolean; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.drawer_player_id === playerId) return { error: "The drawer can't guess" }

  if (session.mode === 'individual') {
    return processIndividualGuess(supabase, gameId, playerId, text, session)
  }

  const teamRows = await loadTeamRows(supabase, gameId)
  const mine = teamRows.find((r) => r.player_id === playerId)
  if (!mine) return { error: 'You are not in this game' }
  if (mine.team !== session.active_team) return { error: "It's not your team's turn" }

  const guess = text.trim()
  if (!guess) return { error: 'Guess is empty' }
  const correct = !!session.current_word && normalizeGuess(guess) === normalizeGuess(session.current_word)

  await supabase.from('quick_draw_guess_guesses').insert({
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
  const primary = quickDrawGuessWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)
  const nextWord = pickQuickDrawWord(primary, session.used_words)
  const name = await playerName(supabase, gameId, playerId)

  const { data: claimed } = await supabase
    .from('quick_draw_guess_sessions')
    .update({
      current_word: nextWord,
      current_stroke_data: emptyStrokeData(),
      used_words: [...session.used_words, nextWord],
      status_message: `${name} guessed it!`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('current_word', session.current_word)
    .select('id')

  if (!claimed || claimed.length === 0) return { correct: true }

  await supabase.from('quick_draw_guess_words').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: session.active_team,
    drawer_player_id: session.drawer_player_id,
    word: session.current_word!,
    status: 'guessed',
    guesser_player_id: playerId,
  })

  return { correct: true }
}

async function processIndividualGuess(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  text: string,
  session: QuickDrawGuessSession
): Promise<{ error?: string; correct?: boolean; internal?: boolean }> {
  const liveRoster = await loadTeamRows(supabase, gameId)
  const liveIds = new Set(liveRoster.map((r) => r.player_id))
  if (!liveIds.has(playerId)) return { error: 'You are not in this game' }

  const guess = text.trim()
  if (!guess) return { error: 'Guess is empty' }
  const correct = !!session.current_word && normalizeGuess(guess) === normalizeGuess(session.current_word)

  if (!correct) {
    await supabase.from('quick_draw_guess_guesses').insert({
      game_id: gameId,
      turn_index: session.turn_index,
      player_id: playerId,
      team: 0,
      text: guess.slice(0, 80),
      correct: false,
      points: 0,
    })
    return { correct: false }
  }

  const points = describeItGuessPoints(session.turn_deadline_at, session.turn_seconds)
  const { data: scored, error: scoreError } = await supabase.rpc('quick_draw_guess_record_correct_guess', {
    p_game_id: gameId,
    p_turn_index: session.turn_index,
    p_player_id: playerId,
    p_text: guess.slice(0, 80),
    p_points: points,
  })
  if (scoreError || scored === false) return { correct: true }

  const { count } = await supabase
    .from('quick_draw_guess_guesses')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('correct', true)
  const guesserCount = [...liveIds].filter((id) => id !== session.drawer_player_id).length
  if ((count ?? 0) >= guesserCount) await endIndividualTurn(supabase, gameId, session)

  return { correct: true }
}

async function endIndividualTurn(
  supabase: SupabaseClient,
  gameId: string,
  session: QuickDrawGuessSession
): Promise<void> {
  const { data: correctGuesses, error: guessesError } = await supabase
    .from('quick_draw_guess_guesses')
    .select('points')
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('correct', true)
  if (guessesError) return
  const guessedCount = correctGuesses?.length ?? 0
  const drawerPoints = (correctGuesses ?? []).reduce((sum, g) => sum + (g.points ?? 0), 0)

  const last =
    quickDrawGuessTotalTurns('individual', session.num_teams, session.roster.length, session.total_rounds) - 1
  const isLastTurn = session.turn_index >= last
  const drawerName = await playerName(supabase, gameId, session.drawer_player_id)
  const tail = isLastTurn ? '' : ' · next drawer soon'
  const statusMessage = `${drawerName}'s word was "${session.current_word}" — ${guessedCount} guessed it${tail}`

  const { data: claimed } = await supabase
    .from('quick_draw_guess_sessions')
    .update({
      phase: 'break',
      turn_deadline_at: null,
      break_deadline_at: deadline(QUICK_DRAW_GUESS_BREAK_SECONDS),
      status_message: statusMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('phase', 'turn')
    .eq('turn_index', session.turn_index)
    .select('id')
  if (!claimed || claimed.length === 0) return

  await supabase.from('quick_draw_guess_words').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: 0,
    drawer_player_id: session.drawer_player_id,
    word: session.current_word!,
    status: guessedCount > 0 ? 'guessed' : 'skipped',
    guesser_player_id: null,
  })

  if (drawerPoints > 0 && session.drawer_player_id) {
    await supabase.rpc('quick_draw_guess_add_score', {
      p_game_id: gameId,
      p_player_id: session.drawer_player_id,
      p_delta: drawerPoints,
    })
  }
}

export async function processQuickDrawGuessSkip(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'turn') return { error: 'Not in a turn right now' }
  if (session.mode === 'individual') return { error: "You can't skip in this mode" }
  if (session.drawer_player_id !== playerId) return { error: 'Only the drawer can skip' }
  if (!session.current_word) return {}

  const { data: game } = await supabase
    .from('games')
    .select('question_source, custom_questions')
    .eq('id', gameId)
    .maybeSingle()
  const primary = quickDrawGuessWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)
  const nextWord = pickQuickDrawWord(primary, session.used_words)

  const { data: claimed } = await supabase
    .from('quick_draw_guess_sessions')
    .update({
      current_word: nextWord,
      current_stroke_data: emptyStrokeData(),
      used_words: [...session.used_words, nextWord],
      status_message: 'Skipped — new word!',
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('current_word', session.current_word)
    .select('id')

  if (!claimed || claimed.length === 0) return {}

  await supabase.from('quick_draw_guess_words').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: session.active_team,
    drawer_player_id: session.drawer_player_id,
    word: session.current_word,
    status: 'skipped',
    guesser_player_id: null,
  })
  return {}
}

export async function processQuickDrawGuessExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return {}
  if (session.phase !== 'turn') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  if (session.mode === 'individual') {
    await endIndividualTurn(supabase, gameId, session)
    return {}
  }

  const { count } = await supabase
    .from('quick_draw_guess_words')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('status', 'guessed')

  const last = quickDrawGuessTotalTurns('team', session.num_teams, 0, session.total_rounds) - 1
  const isLastTurn = session.turn_index >= last

  const { error: updateError } = await supabase
    .from('quick_draw_guess_sessions')
    .update({
      phase: 'break',
      turn_deadline_at: null,
      break_deadline_at: deadline(QUICK_DRAW_GUESS_BREAK_SECONDS),
      status_message: isLastTurn ? 'Final results soon' : `${teamLabel(session.active_team)}'s turn is over`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('phase', 'turn')
    .eq('turn_index', session.turn_index)
  if (updateError) return internalFailure('quick-draw-guess:expire', updateError)

  if ((count ?? 0) === 0 && session.current_word) {
    await supabase.from('quick_draw_guess_words').insert({
      game_id: gameId,
      turn_index: session.turn_index,
      round: session.current_round,
      team: session.active_team,
      drawer_player_id: session.drawer_player_id,
      word: session.current_word,
      status: 'skipped',
      guesser_player_id: null,
    })
  }

  return {}
}

export async function processQuickDrawGuessAdvance(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return {}
  if (session.phase !== 'break') return {}
  if (!opts?.force && (!session.break_deadline_at || new Date(session.break_deadline_at).getTime() > Date.now())) {
    return {}
  }

  const { data: game } = await supabase
    .from('games')
    .select('question_source, custom_questions')
    .eq('id', gameId)
    .maybeSingle()
  const primary = quickDrawGuessWordPool((game ?? {}) as Pick<Game, 'question_source' | 'custom_questions'>)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const teamRows = await loadTeamRows(supabase, gameId)
    const roster = teamRoster(teamRows)
    let nextIndex = session.turn_index + 1
    if (session.mode === 'individual') {
      const liveIds = new Set(teamRows.map((r) => r.player_id))
      const totalTurns = quickDrawGuessTotalTurns(
        'individual',
        session.num_teams,
        session.roster.length,
        session.total_rounds
      )
      nextIndex = nextIndividualDescriberIndex(session.roster, nextIndex, liveIds, totalTurns)
    }

    const nextTurn = buildTurn({
      turnIndex: nextIndex,
      mode: session.mode,
      numTeams: session.num_teams,
      totalRounds: session.total_rounds,
      turnSeconds: session.turn_seconds,
      teamRoster: roster,
      individualRoster: session.roster,
      primary,
      usedWords: session.used_words,
    })

    if (!nextTurn) {
      const { data: finished, error: finishError } = await supabase
        .from('quick_draw_guess_sessions')
        .update({
          phase: 'finished',
          status: 'finished',
          turn_deadline_at: null,
          break_deadline_at: null,
          status_message: 'Final results',
          updated_at: new Date().toISOString(),
        })
        .eq('game_id', gameId)
        .eq('phase', 'break')
        .eq('turn_index', session.turn_index)
        .select('id')
      if (finishError) return internalFailure('quick-draw-guess:advance:finish', finishError)
      if (finished && finished.length > 0) await markGameFinished(supabase, gameId)
      return {}
    }

    const nextMessage =
      session.mode === 'individual'
        ? `${await playerName(supabase, gameId, nextTurn.drawer_player_id ?? null)} draws`
        : `${teamLabel(nextTurn.active_team!)} draws`

    const { error: updateError } = await supabase
      .from('quick_draw_guess_sessions')
      .update({
        ...nextTurn,
        status_message: nextMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
      .eq('phase', 'break')
      .eq('turn_index', session.turn_index)
    if (!updateError) return {}
    if (attempt === 0 && session.mode === 'individual' && isForeignKeyViolation(updateError)) continue
    return internalFailure('quick-draw-guess:advance', updateError)
  }
  return {}
}

export function computeQuickDrawGuessTeamScores(
  words: Pick<QuickDrawGuessWord, 'team' | 'status'>[],
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

export function quickDrawGuessIndividualLeaderboard(
  playerRows: Array<{ player_id: string; score?: number | null }>,
  players: Array<{ id: string; name: string }>
): DescribeItPlayerScore[] {
  return describeItIndividualLeaderboard(playerRows, players)
}

export function quickDrawGuessRoleLeaderboards(
  guesses: Array<Pick<QuickDrawGuessGuess, 'player_id' | 'turn_index' | 'points'>>,
  roster: string[],
  players: Array<{ id: string; name: string; spectator?: boolean | null }>
) {
  return describeItRoleLeaderboards(guesses, roster, players)
}

export async function assignQuickDrawGuessLateJoinTeam(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ team: number; error?: string }> {
  const { data: game } = await supabase
    .from('games')
    .select('quick_draw_num_teams, quick_draw_variant, quick_draw_play_mode')
    .eq('id', gameId)
    .maybeSingle()
  if (game?.quick_draw_variant !== 'guess') return { team: 1 }
  if (clampQuickDrawPlayMode(game.quick_draw_play_mode) === 'individual') {
    const { error } = await supabase
      .from('quick_draw_guess_players')
      .upsert({ game_id: gameId, player_id: playerId, team: 1, score: 0 }, { onConflict: 'game_id,player_id' })
    if (error) return { team: 1, error: internalErrorMessage('quick-draw-guess:assignLateJoinIndividual', error) }
    return { team: 1 }
  }
  const numTeams = clampQuickDrawNumTeams(game.quick_draw_num_teams)
  const rows = await loadTeamRows(supabase, gameId)
  const counts = new Array(numTeams + 1).fill(0)
  for (const r of rows) if (r.team >= 1 && r.team <= numTeams) counts[r.team] += 1
  let smallest = 1
  for (let t = 2; t <= numTeams; t += 1) if (counts[t] < counts[smallest]) smallest = t

  const { error } = await supabase
    .from('quick_draw_guess_players')
    .upsert({ game_id: gameId, player_id: playerId, team: smallest }, { onConflict: 'game_id,player_id' })
  if (error) return { team: smallest, error: internalErrorMessage('quick-draw-guess:assignLateJoinTeam', error) }
  return { team: smallest }
}

export async function clearQuickDrawGuessSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; poolUsage?: Record<string, unknown> }> {
  const { data: session } = await supabase
    .from('quick_draw_guess_sessions')
    .select('used_words')
    .eq('game_id', gameId)
    .maybeSingle()
  const usedThisGame = Array.isArray(session?.used_words) ? (session!.used_words as string[]) : []
  let poolUsage: Record<string, unknown> | undefined
  if (usedThisGame.length > 0) {
    const { data: game } = await supabase.from('games').select('pool_usage').eq('id', gameId).maybeSingle()
    const prior = readUsedFromPoolUsage(game?.pool_usage)
    const merged = [...new Set([...prior, ...usedThisGame].map((w) => w.toLowerCase()))].map(
      (key) => usedThisGame.find((w) => w.toLowerCase() === key) ?? prior.find((w) => w.toLowerCase() === key) ?? key
    )
    poolUsage = { quick_draw_guess_used: merged }
  }

  const tables = ['quick_draw_guess_guesses', 'quick_draw_guess_words', 'quick_draw_guess_sessions'] as const
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: internalErrorMessage('quick-draw-guess:clear', error) }
  }
  await supabase.from('quick_draw_guess_players').update({ score: 0 }).eq('game_id', gameId)
  return poolUsage ? { poolUsage } : {}
}

export { DESCRIBE_IT_MIN_PER_TEAM as QUICK_DRAW_GUESS_MIN_PER_TEAM, DESCRIBE_IT_GUESS_BASE_POINTS }
