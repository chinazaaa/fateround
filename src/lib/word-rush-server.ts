// Server-only Word Rush game logic (Supabase + dictionary). Import from API routes only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { internalFailure } from '@/lib/api-errors'
import { markGameFinished } from '@/lib/game-finish'
import { isValidWordRushWord, pickRandomLetterPair, validLetterPairCount } from '@/lib/word-rush-dictionary'
import {
  WORD_RUSH_BREAK_SECONDS,
  WORD_RUSH_MIN_PLAYERS,
  WORD_RUSH_MIN_PLAYERS_INDIVIDUAL,
  WORD_RUSH_ROUND_RESULTS_SECONDS,
  balanceWordRushTeams,
  allWordRushIndividualPlayersSubmitted,
  clampWordRushMode,
  clampWordRushPromptMode,
  clampWordRushRounds,
  clampWordRushTeams,
  clampWordRushTurnSeconds,
  letterPairKey,
  mergeWordRushUsedPairs,
  normalizeWordRushWord,
  promptSetterForIndividualRound,
  promptSetterForTeamRound,
  readWordRushUsedPairsFromPoolUsage,
  wordRushPriorUsedPairsForNewGame,
  WORD_RUSH_POOL_USAGE_KEY,
  teamRoundIndexFromTurn,
  currentTeamRoundNumber,
  wordRushTotalTeamTurns,
  wordRushIndividualGuessPoints,
  wordRushIndividualGuessPointsAt,
  teamForTurnIndex,
  teamLabel,
  teamRoster,
  wordRushLobbyReady,
} from '@/lib/word-rush'
import type { WordRushPhase, WordRushPromptMode, WordRushSession } from '@/types'

function deadline(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: WordRushSession | null; error?: string; internal?: boolean }> {
  const { data, error } = await supabase.from('word_rush_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: 'Could not load session', internal: true }
  return { session: data as WordRushSession | null }
}

async function loadTeamRows(supabase: SupabaseClient, gameId: string) {
  const { data, error } = await supabase.from('word_rush_players').select('player_id,team,score').eq('game_id', gameId)
  if (error) throw error
  return data ?? []
}

async function playerName(supabase: SupabaseClient, gameId: string, playerId: string | null): Promise<string> {
  if (!playerId) return 'Someone'
  const { data } = await supabase.from('players').select('name').eq('game_id', gameId).eq('id', playerId).maybeSingle()
  return data?.name ?? 'Someone'
}

function nextAutoPrompt(usedPairs: string[]): { start: string; end: string; key: string } | null {
  const pair = pickRandomLetterPair(usedPairs)
  if (!pair) return null
  return { ...pair, key: letterPairKey(pair.start, pair.end) }
}

function buildTeamTurnStart(opts: {
  turnIndex: number
  numTeams: number
  totalRounds: number
  turnSeconds: number
  promptMode: WordRushPromptMode
  promptSetterId: string | null
  usedPairs: string[]
}): Partial<WordRushSession> {
  const activeTeam = teamForTurnIndex(opts.turnIndex, opts.numTeams)
  const currentRound = currentTeamRoundNumber(opts.turnIndex, opts.numTeams)
  const auto = opts.promptMode === 'automatic' ? nextAutoPrompt(opts.usedPairs) : null
  const awaiting = opts.promptMode === 'manual' && !auto
  return {
    phase: awaiting ? 'awaiting_prompt' : 'playing',
    turn_index: opts.turnIndex,
    current_round: currentRound,
    active_team: activeTeam,
    prompt_setter_player_id: opts.promptSetterId,
    start_letter: auto?.start ?? null,
    end_letter: auto?.end ?? null,
    prompt_index: 0,
    turn_deadline_at: deadline(opts.turnSeconds),
    intermission_deadline_at: null,
    status_message: awaiting
      ? `Round ${currentRound} — ${teamLabel(activeTeam)} enter the first letter pair`
      : `Round ${currentRound} — ${teamLabel(activeTeam)} — Starts with ${auto!.start.toUpperCase()}, Ends with ${auto!.end.toUpperCase()}`,
    used_pairs: auto ? [...opts.usedPairs, auto.key] : opts.usedPairs,
  }
}

function buildIndividualRoundStart(opts: {
  roundIndex: number
  totalRounds: number
  turnSeconds: number
  promptMode: WordRushPromptMode
  promptSetterId: string | null
  usedPairs: string[]
}): Partial<WordRushSession> {
  const auto = opts.promptMode === 'automatic' ? nextAutoPrompt(opts.usedPairs) : null
  const awaiting = opts.promptMode === 'manual' && !auto
  return {
    phase: awaiting ? 'awaiting_prompt' : 'playing',
    turn_index: opts.roundIndex,
    current_round: opts.roundIndex + 1,
    active_team: 0,
    prompt_setter_player_id: opts.promptSetterId,
    start_letter: auto?.start ?? null,
    end_letter: auto?.end ?? null,
    prompt_index: 0,
    turn_deadline_at: deadline(opts.turnSeconds),
    intermission_deadline_at: null,
    status_message: awaiting
      ? `Round ${opts.roundIndex + 1} — enter the letter pair`
      : `Round ${opts.roundIndex + 1} — Starts with ${auto!.start.toUpperCase()}, Ends with ${auto!.end.toUpperCase()}`,
    used_pairs: auto ? [...opts.usedPairs, auto.key] : opts.usedPairs,
  }
}

export async function initializeWordRushGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string; internal?: boolean }> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('word_rush_mode, word_rush_prompt_mode, word_rush_num_teams, rounds_count, timer_seconds, pool_usage')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError || !game) return internalFailure('word-rush:initialize:game', gameError)

  const mode = clampWordRushMode(game.word_rush_mode)
  const promptMode = clampWordRushPromptMode(game.word_rush_prompt_mode)
  const numTeams = clampWordRushTeams(game.word_rush_num_teams)
  const totalRounds = clampWordRushRounds(game.rounds_count)
  const turnSeconds = clampWordRushTurnSeconds(game.timer_seconds)
  const initialUsedPairs =
    promptMode === 'automatic'
      ? wordRushPriorUsedPairsForNewGame(readWordRushUsedPairsFromPoolUsage(game.pool_usage), validLetterPairCount())
      : []

  const roster: string[] = playerIds

  if (mode === 'individual') {
    if (playerIds.length < WORD_RUSH_MIN_PLAYERS_INDIVIDUAL) {
      return { error: `Need at least ${WORD_RUSH_MIN_PLAYERS_INDIVIDUAL} players to start` }
    }
    const rows = playerIds.map((player_id) => ({ game_id: gameId, player_id, team: 1, score: 0 }))
    const { error: seedError } = await supabase
      .from('word_rush_players')
      .upsert(rows, { onConflict: 'game_id,player_id' })
    if (seedError) return internalFailure('word-rush:initialize:seed', seedError)
  } else {
    if (playerIds.length < WORD_RUSH_MIN_PLAYERS) {
      return { error: `Need at least ${WORD_RUSH_MIN_PLAYERS} players to start` }
    }
    const existingRows = await loadTeamRows(supabase, gameId)
    const assignment = balanceWordRushTeams(playerIds, existingRows, numTeams)
    const existingIds = new Set(existingRows.map((r) => r.player_id))
    const newRows = [...assignment.entries()]
      .filter(([player_id]) => !existingIds.has(player_id))
      .map(([player_id, team]) => ({ game_id: gameId, player_id, team, score: 0 }))
    if (newRows.length > 0) {
      const { error: assignError } = await supabase
        .from('word_rush_players')
        .upsert(newRows, { onConflict: 'game_id,player_id' })
      if (assignError) return internalFailure('word-rush:initialize:assign', assignError)
    }
    const teamRows = newRows.length > 0 ? await loadTeamRows(supabase, gameId) : existingRows
    const ready = wordRushLobbyReady(teamRows, numTeams, mode)
    if (!ready.ok) return { error: ready.error }
  }

  const promptSetterId =
    mode === 'individual' && promptMode === 'manual' ? promptSetterForIndividualRound(roster, 0) : null

  const teamPromptSetter =
    mode === 'team' && promptMode === 'manual'
      ? promptSetterForTeamRound(teamRoster(await loadTeamRows(supabase, gameId)).get(1) ?? [], 0)
      : null

  const startPartial =
    mode === 'individual'
      ? buildIndividualRoundStart({
          roundIndex: 0,
          totalRounds,
          turnSeconds,
          promptMode,
          promptSetterId,
          usedPairs: initialUsedPairs,
        })
      : buildTeamTurnStart({
          turnIndex: 0,
          numTeams,
          totalRounds,
          turnSeconds,
          promptMode,
          promptSetterId: teamPromptSetter,
          usedPairs: initialUsedPairs,
        })

  const row = {
    mode,
    prompt_mode: promptMode,
    num_teams: numTeams,
    total_rounds: totalRounds,
    turn_seconds: turnSeconds,
    roster,
    status: 'active' as const,
    ...startPartial,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase.from('word_rush_sessions').select('id').eq('game_id', gameId).maybeSingle()
  const { error } = existing
    ? await supabase.from('word_rush_sessions').update(row).eq('game_id', gameId)
    : await supabase.from('word_rush_sessions').insert({ ...row, game_id: gameId })
  if (error) return internalFailure('word-rush:initialize:session', error)
  return {}
}

export async function processWordRushPrompt(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  startLetter: string,
  endLetter: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'awaiting_prompt') return { error: 'Not waiting for a prompt right now' }
  if (session.prompt_setter_player_id !== playerId) return { error: 'Only the prompt setter can enter letters' }

  const start = startLetter.trim().toLowerCase()
  const end = endLetter.trim().toLowerCase()
  if (!/^[a-z]$/.test(start) || !/^[a-z]$/.test(end)) {
    return { error: 'Enter a single letter for start and end' }
  }
  if (start === end) return { error: 'Start and end letters must be different' }

  const key = letterPairKey(start, end)
  const { data: claimed } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: 'playing',
      start_letter: start,
      end_letter: end,
      used_pairs: [...session.used_pairs, key],
      status_message: `Starts with ${start.toUpperCase()}, Ends with ${end.toUpperCase()}`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('phase', 'awaiting_prompt')
    .eq('turn_index', session.turn_index)
    .select('id')

  if (!claimed?.length) return { error: 'Prompt already set' }
  return {}
}

export async function processWordRushSubmit(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  text: string
): Promise<{ error?: string; correct?: boolean; points?: number; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'playing') return { error: 'Not accepting answers right now' }
  if (!session.start_letter || !session.end_letter) return { error: 'No active prompt' }

  const teamRows = await loadTeamRows(supabase, gameId)
  const mine = teamRows.find((r) => r.player_id === playerId)
  if (!mine) return { error: 'You are not in this game' }

  let priorIndividualAnswer: { id: string; correct: boolean } | null = null

  if (session.mode === 'team') {
    if (mine.team !== session.active_team) return { error: "It's not your team's turn" }
    if (session.prompt_setter_player_id === playerId && session.prompt_mode === 'manual') {
      return { error: 'Prompt setter enters letters, not answers' }
    }
  } else {
    if (session.prompt_mode === 'manual' && session.prompt_setter_player_id === playerId) {
      return { error: 'You are setting the prompt this round' }
    }
    const { data: existing } = await supabase
      .from('word_rush_answers')
      .select('id, correct')
      .eq('game_id', gameId)
      .eq('turn_index', session.turn_index)
      .eq('player_id', playerId)
      .maybeSingle()
    priorIndividualAnswer = existing
    if (existing?.correct) return { error: 'You already got this round right' }
  }

  const guess = text.trim()
  if (!guess) return { error: 'Answer is empty' }

  const normalized = normalizeWordRushWord(guess)
  const correct = isValidWordRushWord(normalized, session.start_letter, session.end_letter)

  if (session.mode === 'individual') {
    if (!correct) return { correct: false }

    const answerRow = {
      game_id: gameId,
      turn_index: session.turn_index,
      round: session.current_round,
      team: mine.team,
      team_turn_index: null,
      prompt_index: session.prompt_index,
      start_letter: session.start_letter,
      end_letter: session.end_letter,
      player_id: playerId,
      text: guess.slice(0, 80),
      correct: true as const,
    }

    if (priorIndividualAnswer) {
      await supabase.from('word_rush_answers').update(answerRow).eq('id', priorIndividualAnswer.id)
    } else {
      await supabase.from('word_rush_answers').insert(answerRow)
    }
    const points = wordRushIndividualGuessPoints(session.turn_deadline_at, session.turn_seconds, normalized.length)
    await supabase.rpc('word_rush_add_score', { p_game_id: gameId, p_player_id: playerId, p_delta: points })

    const { data: roundAnswers } = await supabase
      .from('word_rush_answers')
      .select('player_id, turn_index, correct')
      .eq('game_id', gameId)
      .eq('turn_index', session.turn_index)

    if (
      allWordRushIndividualPlayersSubmitted(
        session,
        (roundAnswers ?? []) as Array<{ player_id: string; turn_index: number; correct: boolean }>
      )
    ) {
      const endResult = await endIndividualRound(supabase, gameId, session)
      if (endResult.error) return endResult
    }

    return { correct: true, points }
  }

  if (!correct) return { correct: false }

  await supabase.from('word_rush_answers').insert({
    game_id: gameId,
    turn_index: session.turn_index,
    round: session.current_round,
    team: mine.team,
    team_turn_index: session.turn_index,
    prompt_index: session.prompt_index,
    start_letter: session.start_letter,
    end_letter: session.end_letter,
    player_id: playerId,
    text: guess.slice(0, 80),
    correct: true,
  })

  const name = await playerName(supabase, gameId, playerId)
  const nextPromptIndex = session.prompt_index + 1
  const auto = session.prompt_mode === 'automatic' ? nextAutoPrompt(session.used_pairs) : null
  const nextPhase: WordRushPhase = session.prompt_mode === 'manual' ? 'awaiting_prompt' : 'playing'

  const { data: claimed } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: nextPhase,
      prompt_index: nextPromptIndex,
      start_letter: auto?.start ?? null,
      end_letter: auto?.end ?? null,
      used_pairs: auto ? [...session.used_pairs, auto.key] : session.used_pairs,
      status_message: `${name} got it! ${auto ? `Starts with ${auto.start.toUpperCase()}, Ends with ${auto.end.toUpperCase()}` : 'Next letters…'}`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('phase', 'playing')
    .eq('turn_index', session.turn_index)
    .eq('prompt_index', session.prompt_index)
    .select('id')

  if (!claimed?.length) return { correct: true }
  return { correct: true }
}

async function endTeamTurn(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession
): Promise<{ error?: string; internal?: boolean }> {
  const nextTurn = session.turn_index + 1
  const totalTeamTurns = wordRushTotalTeamTurns(session.num_teams, session.total_rounds)

  if (nextTurn >= totalTeamTurns) {
    return finishWordRushGame(supabase, gameId, session, 'All rounds complete!')
  }

  const { count } = await supabase
    .from('word_rush_answers')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('team', session.active_team)
    .eq('team_turn_index', session.turn_index)
    .eq('correct', true)

  const teamScore = count ?? 0
  const finishedRound = session.current_round
  const nextTeam = teamForTurnIndex(nextTurn, session.num_teams)
  const nextRound = currentTeamRoundNumber(nextTurn, session.num_teams)
  const teamRows = await loadTeamRows(supabase, gameId)
  const roundIndex = teamRoundIndexFromTurn(nextTurn, session.num_teams)
  const promptSetter =
    session.prompt_mode === 'manual'
      ? promptSetterForTeamRound(teamRoster(teamRows).get(nextTeam) ?? [], roundIndex)
      : null

  const nextStart = buildTeamTurnStart({
    turnIndex: nextTurn,
    numTeams: session.num_teams,
    totalRounds: session.total_rounds,
    turnSeconds: session.turn_seconds,
    promptMode: session.prompt_mode,
    promptSetterId: promptSetter,
    usedPairs: session.used_pairs,
  })

  const statusMessage =
    nextRound > finishedRound
      ? `Round ${finishedRound} complete — ${teamLabel(session.active_team)} scored ${teamScore}. Round ${nextRound} — ${teamLabel(nextTeam)} is up`
      : `${teamLabel(session.active_team)} scored ${teamScore}! ${teamLabel(nextTeam)} is up next`

  const { error } = await supabase
    .from('word_rush_sessions')
    .update({
      ...nextStart,
      status_message: statusMessage,
      intermission_deadline_at: deadline(WORD_RUSH_BREAK_SECONDS),
      phase: 'intermission',
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
  if (error) return internalFailure('word-rush:end-team-turn', error)
  return {}
}

async function endIndividualRound(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession
): Promise<{ error?: string; internal?: boolean }> {
  const { data: correctGuesses, error: guessesError } = await supabase
    .from('word_rush_answers')
    .select('player_id, created_at, text')
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('correct', true)
  if (guessesError) return internalFailure('word-rush:end-individual-round:guesses', guessesError)

  const setterId = session.prompt_setter_player_id
  let mirrorPoints = 0
  let guessedCount = 0
  for (const guess of correctGuesses ?? []) {
    if (guess.player_id === setterId) continue
    guessedCount += 1
    mirrorPoints += wordRushIndividualGuessPointsAt(
      session.turn_deadline_at,
      session.turn_seconds,
      new Date(guess.created_at).getTime(),
      normalizeWordRushWord(guess.text).length
    )
  }

  const nextRound = session.turn_index + 1
  const isLastRound = nextRound >= session.total_rounds
  const nextSetter =
    isLastRound || session.prompt_mode !== 'manual' ? null : promptSetterForIndividualRound(session.roster, nextRound)

  const nextStart = isLastRound
    ? null
    : buildIndividualRoundStart({
        roundIndex: nextRound,
        totalRounds: session.total_rounds,
        turnSeconds: session.turn_seconds,
        promptMode: session.prompt_mode,
        promptSetterId: nextSetter,
        usedPairs: session.used_pairs,
      })

  const statusMessage = isLastRound
    ? 'All rounds complete!'
    : `Round ${session.current_round} complete — ${guessedCount} guessed it`

  const { data: claimed, error } = await supabase
    .from('word_rush_sessions')
    .update({
      ...(isLastRound
        ? {
            phase: 'finished' as const,
            status: 'finished' as const,
            status_message: statusMessage,
            turn_deadline_at: null,
            intermission_deadline_at: null,
          }
        : {
            ...nextStart,
            phase: 'intermission' as const,
            intermission_deadline_at: deadline(WORD_RUSH_ROUND_RESULTS_SECONDS),
            status_message: statusMessage,
          }),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .in('phase', ['playing', 'awaiting_prompt'])
    .select('id')

  if (error) return internalFailure('word-rush:end-individual-round', error)
  if (!claimed?.length) return {}

  if (mirrorPoints > 0 && setterId) {
    await supabase.rpc('word_rush_add_score', {
      p_game_id: gameId,
      p_player_id: setterId,
      p_delta: mirrorPoints,
    })
  }

  if (isLastRound) {
    await markGameFinished(supabase, gameId)
  }
  return {}
}

async function finishWordRushGame(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession,
  message: string
): Promise<{ error?: string; internal?: boolean }> {
  const { data: claimed, error } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: 'finished',
      status: 'finished',
      status_message: message,
      turn_deadline_at: null,
      intermission_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .neq('status', 'finished')
    .select('id')
  if (error) return internalFailure('word-rush:finish', error)
  if (!claimed?.length) return {}
  await markGameFinished(supabase, gameId)
  return {}
}

export async function finishWordRushGameEarly(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return {}

  const { error: updateError } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: 'finished',
      status: 'finished',
      status_message: 'Host ended the game',
      turn_deadline_at: null,
      intermission_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .neq('status', 'finished')
  if (updateError) return internalFailure('word-rush:finish-early', updateError)
  return {}
}

export async function processWordRushEndRoundEarly(
  supabase: SupabaseClient,
  gameId: string,
  hostToken: string
): Promise<{ error?: string; internal?: boolean }> {
  const { data: game } = await supabase.from('games').select('host_token, status').eq('id', gameId).maybeSingle()
  if (!game) return { error: 'Game not found' }
  if (game.host_token !== hostToken) return { error: 'Invalid host token' }
  if (game.status !== 'active') return { error: 'Game not active' }

  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'playing' && session.phase !== 'awaiting_prompt') {
    return { error: 'Round already ended' }
  }

  if (session.mode === 'team') return endTeamTurn(supabase, gameId, session)
  return endIndividualRound(supabase, gameId, session)
}

export async function processWordRushExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return {}
  if (session.phase !== 'playing' && session.phase !== 'awaiting_prompt') return {}
  if (!session.turn_deadline_at) return {}
  if (new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  if (session.mode === 'team') return endTeamTurn(supabase, gameId, session)
  return endIndividualRound(supabase, gameId, session)
}

function individualPlayingStatusMessage(
  session: Pick<WordRushSession, 'current_round' | 'start_letter' | 'end_letter'>
): string {
  if (session.start_letter && session.end_letter) {
    return `Round ${session.current_round} — Starts with ${session.start_letter.toUpperCase()}, Ends with ${session.end_letter.toUpperCase()}`
  }
  return `Round ${session.current_round} — enter the letter pair`
}

export async function processWordRushAdvance(
  supabase: SupabaseClient,
  gameId: string,
  hostToken?: string
): Promise<{ error?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase !== 'intermission') return { error: 'Not in intermission' }

  if (hostToken) {
    const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).maybeSingle()
    if (game?.host_token !== hostToken) return { error: 'Invalid host token' }
  } else if (session.intermission_deadline_at && new Date(session.intermission_deadline_at).getTime() > Date.now()) {
    return {}
  }

  const nextPhase = session.start_letter ? 'playing' : 'awaiting_prompt'
  const statusMessage =
    session.mode === 'individual'
      ? individualPlayingStatusMessage(session)
      : nextPhase === 'playing' && session.start_letter && session.end_letter
        ? `Round ${session.current_round} — ${teamLabel(session.active_team)} — Starts with ${session.start_letter.toUpperCase()}, Ends with ${session.end_letter.toUpperCase()}`
        : session.status_message

  const { error: updateError } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: nextPhase,
      intermission_deadline_at: null,
      status_message: statusMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('phase', 'intermission')
  if (updateError) return internalFailure('word-rush:advance', updateError)
  return {}
}

export async function assignWordRushTeam(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  team: number
): Promise<{ error?: string; internal?: boolean }> {
  const { data: game } = await supabase
    .from('games')
    .select('status, word_rush_num_teams')
    .eq('id', gameId)
    .maybeSingle()
  if (!game || game.status !== 'waiting') return { error: 'Lobby is closed' }
  const numTeams = clampWordRushTeams(game.word_rush_num_teams)
  if (team < 1 || team > numTeams) return { error: 'Invalid team' }

  const { error } = await supabase
    .from('word_rush_players')
    .upsert({ game_id: gameId, player_id: playerId, team, score: 0 }, { onConflict: 'game_id,player_id' })
  if (error) return internalFailure('word-rush:team', error)
  return {}
}

export async function assignWordRushLateJoinTeam(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const rows = await loadTeamRows(supabase, gameId)
  if (rows.some((r) => r.player_id === playerId)) return {}

  const { data: game } = await supabase
    .from('games')
    .select('word_rush_mode, word_rush_num_teams')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { error: 'Game not found' }

  const mode = clampWordRushMode(game.word_rush_mode)
  if (mode === 'individual') {
    const { error } = await supabase
      .from('word_rush_players')
      .upsert({ game_id: gameId, player_id: playerId, team: 1, score: 0 }, { onConflict: 'game_id,player_id' })
    if (error) return internalFailure('word-rush:late-join-individual', error)
    return {}
  }

  const numTeams = clampWordRushTeams(game.word_rush_num_teams)
  const assignment = balanceWordRushTeams([playerId], rows, numTeams)
  const team = assignment.get(playerId) ?? 1
  const { error } = await supabase
    .from('word_rush_players')
    .upsert({ game_id: gameId, player_id: playerId, team, score: 0 }, { onConflict: 'game_id,player_id' })
  if (error) return internalFailure('word-rush:late-join-team', error)
  return {}
}

export async function persistWordRushTeamAssignment(
  supabase: SupabaseClient,
  gameId: string,
  assignment: Map<string, number>
): Promise<{ error?: string; internal?: boolean }> {
  const rows = [...assignment.entries()].map(([player_id, team]) => ({
    game_id: gameId,
    player_id,
    team,
    score: 0,
  }))
  if (rows.length === 0) return {}
  const { error } = await supabase.from('word_rush_players').upsert(rows, { onConflict: 'game_id,player_id' })
  if (error) return internalFailure('word-rush:teams', error)
  return {}
}

export async function clearWordRushSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; poolUsage?: Record<string, unknown> }> {
  const { data: session } = await supabase
    .from('word_rush_sessions')
    .select('used_pairs')
    .eq('game_id', gameId)
    .maybeSingle()
  const usedThisGame = Array.isArray(session?.used_pairs) ? (session!.used_pairs as string[]) : []

  let poolUsage: Record<string, unknown> | undefined
  if (usedThisGame.length > 0) {
    const { data: game } = await supabase.from('games').select('pool_usage').eq('id', gameId).maybeSingle()
    const prior = readWordRushUsedPairsFromPoolUsage(game?.pool_usage)
    poolUsage = { [WORD_RUSH_POOL_USAGE_KEY]: mergeWordRushUsedPairs(prior, usedThisGame) }
  }

  await supabase.from('word_rush_answers').delete().eq('game_id', gameId)
  await supabase.from('word_rush_sessions').delete().eq('game_id', gameId)
  const { error } = await supabase.from('word_rush_players').update({ score: 0 }).eq('game_id', gameId)
  if (error) return { error: 'Could not reset scores' }
  return poolUsage ? { poolUsage } : {}
}
