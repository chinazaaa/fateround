// Server-only Word Rush game logic (Supabase + dictionary). Import from API routes only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { internalFailure } from '@/lib/api-errors'
import { markGameFinished, recoverFinishBookkeeping } from '@/lib/game-finish'
import {
  pickRandomLetterPair,
  pairSupportsMinLengthForLetters,
  validLetterPairCount,
  wordRushWordRejectReason,
} from '@/lib/word-rush-dictionary'
import {
  WORD_RUSH_BREAK_SECONDS,
  WORD_RUSH_MIN_PLAYERS,
  WORD_RUSH_MIN_PLAYERS_INDIVIDUAL,
  WORD_RUSH_ROUND_RESULTS_SECONDS,
  balanceWordRushTeams,
  allWordRushIndividualPlayersSubmitted,
  clampWordRushDifficulty,
  clampWordRushManualMinLength,
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
  wordRushMinLengthForRound,
  wordRushMinLengthHint,
  wordRushPriorUsedPairsForNewGame,
  WORD_RUSH_POOL_USAGE_KEY,
  teamRoundIndexFromTurn,
  currentTeamRoundNumber,
  wordRushTotalTeamTurns,
  wordRushIndividualGuessPoints,
  wordRushIndividualGuessPointsAt,
  wordRushIndividualAnswerers,
  teamForTurnIndex,
  teamLabel,
  teamRoster,
  wordRushLobbyReady,
  wordRushPlayableTeams,
  nextPlayableTeamTurnIndex,
} from '@/lib/word-rush'
import type {
  WordRushDifficulty,
  WordRushPhase,
  WordRushPromptMode,
  WordRushRoundFinalize,
  WordRushSession,
} from '@/types'

function deadline(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: WordRushSession | null; error?: string; internal?: boolean }> {
  const { data, error } = await supabase.from('word_rush_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: 'Could not load session', internal: true }
  const session = data as WordRushSession | null
  // A previous request closed an individual round but did not finish its effects (see
  // endIndividualRound). Every request that loads the session picks the work back up, so a
  // transient failure after the claim can never leave points or the game finish lost.
  if (session?.round_finalize) {
    const resumed = await runRoundFinalization(supabase, gameId, session.round_finalize)
    if (!resumed.error) {
      const { data: fresh } = await supabase.from('word_rush_sessions').select('*').eq('game_id', gameId).maybeSingle()
      if (fresh) return { session: fresh as WordRushSession }
    }
  }
  return { session }
}

/** Points for one correct individual guess, summed for the round (the setter's mirror score). */
function tallyIndividualGuesses(
  guesses: Array<{ player_id: string; created_at: string; text: string }> | null,
  setterId: string | null,
  turnDeadlineAt: string | null,
  turnSeconds: number
): { points: number; count: number } {
  let points = 0
  let count = 0
  for (const guess of guesses ?? []) {
    if (guess.player_id === setterId) continue
    count += 1
    points += wordRushIndividualGuessPointsAt(
      turnDeadlineAt,
      turnSeconds,
      new Date(guess.created_at).getTime(),
      normalizeWordRushWord(guess.text).length
    )
  }
  return { points, count }
}

/**
 * The effects of a closed individual round: the setter's mirror points, the "N guessed it" message
 * and, on the last round, the game finish. Written to be resumed: the claim that closed the round
 * stored `round_finalize` in the same UPDATE, every step here is idempotent, and the marker is only
 * cleared once all of them have been applied. Answer admission is closed once the claim has landed,
 * so the answers read here are the final set (no fallback to the pre-claim read is needed).
 * On any failure the marker stays and the next request that loads the session resumes.
 */
async function runRoundFinalization(
  supabase: SupabaseClient,
  gameId: string,
  pending: WordRushRoundFinalize
): Promise<{ error?: string; internal?: boolean; gameFinishWon?: boolean }> {
  const { data: finalGuesses, error: finalError } = await supabase
    .from('word_rush_answers')
    .select('player_id, created_at, text')
    .eq('game_id', gameId)
    .eq('turn_index', pending.turn_index)
    .eq('correct', true)
  if (finalError) return internalFailure('word-rush:finalize-round:answers', finalError)
  const finalTally = tallyIndividualGuesses(
    finalGuesses,
    pending.setter_id,
    pending.turn_deadline_at,
    pending.turn_seconds
  )

  // 1. Mirror points: applied once, atomically with the `awarded` flag in the marker.
  if (!pending.awarded) {
    const { data: outcome, error: awardError } = await supabase.rpc('word_rush_finalize_award', {
      p_game_id: gameId,
      p_session_id: pending.session_id,
      p_turn_index: pending.turn_index,
      p_player_id: pending.setter_id,
      p_delta: finalTally.points,
    })
    if (awardError) return internalFailure('word-rush:finalize-round:award', awardError)
    // Another request already completed the whole finalization and cleared the marker.
    if (outcome === 'not_pending') return {}
  }

  // 2. The intermission message carries the final count (the claim only knew the pre-claim read).
  if (!pending.is_last) {
    const { error: messageError } = await supabase
      .from('word_rush_sessions')
      .update({ status_message: `Round ${pending.round} complete — ${finalTally.count} guessed it` })
      .eq('game_id', gameId)
      .eq('id', pending.session_id)
      .eq('turn_index', pending.turn_index + 1)
      .eq('phase', 'intermission')
    if (messageError) return internalFailure('word-rush:finalize-round:message', messageError)
  }

  // 3. Last round: finish the game, then its post-finish bookkeeping (room points, trophy snapshot).
  // That bookkeeping reads this session's rows and Play Again deletes them, so the flip records a
  // durable `games.finish_bookkeeping` marker in the same statement and the bookkeeping runs under a
  // lease (see recoverFinishBookkeeping); every other way this game can finish (admin, idle reaper)
  // does the same. A resumed attempt that lost the flip recovers whatever its predecessor left owed.
  let gameFinishWon = false
  if (pending.is_last) {
    // Bound to this session: a finalizer that outlives Play Again must not finish the new game.
    const finished = await markGameFinished(supabase, gameId, undefined, {
      roundGuard: {
        rpc: 'word_rush_finish_game_for_session',
        params: {
          p_session_id: pending.session_id,
          // The leaver whose seat deletion this finish owes, recorded in the same transaction as the finish.
          ...(pending.leaver_id ? { p_leaver_player_id: pending.leaver_id } : {}),
        },
      },
      trackBookkeeping: true,
    })
    if (finished.error) return internalFailure('word-rush:finalize-round:finish', finished.error)
    // Only the request that flipped the GAME row owns the finish; an independent finish that landed first made this a loss.
    gameFinishWon = finished.won
    const bookkeeping = finished.won ? finished.bookkeeping : (await recoverFinishBookkeeping(supabase, gameId)).state
    // Only a runner that saw the bookkeeping through may clear the marker (which lets Play Again reset).
    if (bookkeeping !== 'none' && bookkeeping !== 'done') {
      // The flip is committed even when its bookkeeping is held / still owed: keep reporting the ownership.
      return { error: 'Game finish is still in progress', gameFinishWon }
    }
  }

  // 4. Everything applied: clear the marker (only for this round).
  const { error: clearError } = await supabase
    .from('word_rush_sessions')
    .update({ round_finalize: null })
    .eq('game_id', gameId)
    .eq('id', pending.session_id)
    .eq('round_finalize->>turn_index', String(pending.turn_index))
  // The game finish this call won is committed even when clearing the marker fails: keep reporting the ownership.
  if (clearError) return { ...internalFailure('word-rush:finalize-round:clear', clearError), gameFinishWon }
  return { gameFinishWon }
}

async function loadTeamRows(supabase: SupabaseClient, gameId: string) {
  const { data, error } = await supabase
    .from('word_rush_players')
    .select('player_id,team,score,players!inner(spectator)')
    .eq('game_id', gameId)
    .not('players.spectator', 'is', true)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    player_id: (r as { player_id: string }).player_id,
    team: (r as { team: number }).team,
    score: (r as { score?: number | null }).score,
  }))
}

async function playerName(supabase: SupabaseClient, gameId: string, playerId: string | null): Promise<string> {
  if (!playerId) return 'Someone'
  const { data } = await supabase.from('players').select('name').eq('game_id', gameId).eq('id', playerId).maybeSingle()
  return data?.name ?? 'Someone'
}

function nextAutoPrompt(
  usedPairs: string[],
  minWordLength: number
): { start: string; end: string; key: string } | null {
  const pair = pickRandomLetterPair(usedPairs, minWordLength)
  if (!pair) return null
  return { ...pair, key: letterPairKey(pair.start, pair.end) }
}

function buildTeamTurnStart(opts: {
  turnIndex: number
  numTeams: number
  totalRounds: number
  turnSeconds: number
  promptMode: WordRushPromptMode
  difficulty: WordRushDifficulty
  promptSetterId: string | null
  usedPairs: string[]
}): Partial<WordRushSession> {
  const activeTeam = teamForTurnIndex(opts.turnIndex, opts.numTeams)
  const currentRound = currentTeamRoundNumber(opts.turnIndex, opts.numTeams)
  const minWordLength = wordRushMinLengthForRound(currentRound, opts.difficulty)
  const minHint = wordRushMinLengthHint(minWordLength)
  const auto = opts.promptMode === 'automatic' ? nextAutoPrompt(opts.usedPairs, minWordLength) : null
  const awaiting = opts.promptMode === 'manual' && !auto
  return {
    phase: awaiting ? 'awaiting_prompt' : 'playing',
    turn_index: opts.turnIndex,
    current_round: currentRound,
    active_team: activeTeam,
    difficulty: opts.difficulty,
    min_word_length: minWordLength,
    prompt_setter_player_id: opts.promptSetterId,
    start_letter: auto?.start ?? null,
    end_letter: auto?.end ?? null,
    prompt_index: 0,
    turn_deadline_at: deadline(opts.turnSeconds),
    intermission_deadline_at: null,
    status_message: awaiting
      ? `Round ${currentRound} — ${teamLabel(activeTeam)} enter the first letter pair${minHint}`
      : `Round ${currentRound} — ${teamLabel(activeTeam)} — Starts with ${auto!.start.toUpperCase()}, Ends with ${auto!.end.toUpperCase()}${minHint}`,
    used_pairs: auto ? [...opts.usedPairs, auto.key] : opts.usedPairs,
  }
}

function buildIndividualRoundStart(opts: {
  roundIndex: number
  totalRounds: number
  turnSeconds: number
  promptMode: WordRushPromptMode
  difficulty: WordRushDifficulty
  promptSetterId: string | null
  usedPairs: string[]
}): Partial<WordRushSession> {
  const currentRound = opts.roundIndex + 1
  const minWordLength = wordRushMinLengthForRound(currentRound, opts.difficulty)
  const minHint = wordRushMinLengthHint(minWordLength)
  const auto = opts.promptMode === 'automatic' ? nextAutoPrompt(opts.usedPairs, minWordLength) : null
  const awaiting = opts.promptMode === 'manual' && !auto
  return {
    phase: awaiting ? 'awaiting_prompt' : 'playing',
    turn_index: opts.roundIndex,
    current_round: currentRound,
    active_team: 0,
    difficulty: opts.difficulty,
    min_word_length: minWordLength,
    prompt_setter_player_id: opts.promptSetterId,
    start_letter: auto?.start ?? null,
    end_letter: auto?.end ?? null,
    prompt_index: 0,
    turn_deadline_at: deadline(opts.turnSeconds),
    intermission_deadline_at: null,
    status_message: awaiting
      ? `Round ${currentRound} — enter the letter pair${minHint}`
      : `Round ${currentRound} — Starts with ${auto!.start.toUpperCase()}, Ends with ${auto!.end.toUpperCase()}${minHint}`,
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
    .select(
      'word_rush_mode, word_rush_prompt_mode, word_rush_difficulty, word_rush_num_teams, rounds_count, timer_seconds, pool_usage'
    )
    .eq('id', gameId)
    .maybeSingle()
  if (gameError || !game) return internalFailure('word-rush:initialize:game', gameError)

  const mode = clampWordRushMode(game.word_rush_mode)
  const promptMode = clampWordRushPromptMode(game.word_rush_prompt_mode)
  const difficulty = clampWordRushDifficulty(game.word_rush_difficulty)
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
          difficulty,
          promptSetterId,
          usedPairs: initialUsedPairs,
        })
      : buildTeamTurnStart({
          turnIndex: 0,
          numTeams,
          totalRounds,
          turnSeconds,
          promptMode,
          difficulty,
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
  endLetter: string,
  requestedMinWordLength?: number
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

  const floor = wordRushMinLengthForRound(session.current_round, session.difficulty)
  const minWordLength = clampWordRushManualMinLength(requestedMinWordLength, floor)
  if (!pairSupportsMinLengthForLetters(start, end, minWordLength)) {
    return {
      error: `No dictionary words of ${minWordLength}+ letters for ${start.toUpperCase()}…${end.toUpperCase()}`,
    }
  }

  const key = letterPairKey(start, end)
  const minHint = wordRushMinLengthHint(minWordLength)
  const { data: claimed } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: 'playing',
      start_letter: start,
      end_letter: end,
      min_word_length: minWordLength,
      used_pairs: [...session.used_pairs, key],
      status_message: `Starts with ${start.toUpperCase()}, Ends with ${end.toUpperCase()}${minHint}`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    // Bound to the session this call inspected: a replacement session (Play Again reuses the game id and can reuse the
    // turn index) must match no row.
    .eq('id', session.id)
    // ...and to the setter this call checked: a setter change (the setter left and another was assigned) keeps the phase and
    // the turn, so without this a request from the removed setter could still store the letters.
    .eq('prompt_setter_player_id', playerId)
    .eq('phase', 'awaiting_prompt')
    .eq('turn_index', session.turn_index)
    .select('id')

  if (!claimed?.length) {
    const { session: now } = await loadSession(supabase, gameId)
    if (now && now.id === session.id && now.phase === 'awaiting_prompt' && now.prompt_setter_player_id !== playerId) {
      return { error: 'Only the prompt setter can enter letters' }
    }
    return { error: 'Prompt already set' }
  }
  return {}
}

export async function processWordRushSubmit(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  text: string
): Promise<{ error?: string; correct?: boolean; points?: number; message?: string; internal?: boolean }> {
  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return { error: 'Game not active' }
  if (session.phase === 'intermission') {
    return {
      error:
        session.mode === 'individual'
          ? 'This round has ended — wait for the next one'
          : 'This run has ended — wait for the next team',
    }
  }
  if (session.phase !== 'playing') return { error: 'Not accepting answers right now' }
  if (!session.start_letter || !session.end_letter) return { error: 'No active prompt' }

  const teamRows = await loadTeamRows(supabase, gameId)
  const mine = teamRows.find((r) => r.player_id === playerId)
  if (!mine) return { error: 'You are not in this game' }

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
    if (existing?.correct) return { error: 'You already got this round right' }
  }

  const guess = text.trim()
  if (!guess) return { error: 'Answer is empty' }

  const normalized = normalizeWordRushWord(guess)
  const minWordLength = session.min_word_length ?? wordRushMinLengthForRound(session.current_round, session.difficulty)
  const rejectReason = wordRushWordRejectReason(guess, session.start_letter, session.end_letter, minWordLength)
  if (rejectReason) return { correct: false, message: rejectReason }

  if (session.mode === 'individual') {
    const points = wordRushIndividualGuessPoints(session.turn_deadline_at, session.turn_seconds, normalized.length)

    // One transaction: re-checks the round is still open (it may have closed since the read
    // above), writes the answer and adds the score. Parallel identical submits all pass the
    // pre-check; exactly one is recorded and scored. If scoring fails the answer rolls back so
    // the player can retry instead of being stuck with a correct answer and no points.
    const { data: outcome, error: recordError } = await supabase.rpc('word_rush_record_individual_answer', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_turn_index: session.turn_index,
      p_prompt_index: session.prompt_index,
      p_round: session.current_round,
      p_team: mine.team,
      p_start_letter: session.start_letter,
      p_end_letter: session.end_letter,
      p_text: guess.slice(0, 80),
      p_points: points,
    })
    if (recordError) {
      return internalFailure('word-rush individual answer', recordError, 'Could not record your answer')
    }
    if (outcome === 'round_closed') return { error: 'This round has ended — wait for the next one' }
    if (outcome === 'already_correct') return { error: 'You already got this round right' }
    if (outcome !== 'recorded') {
      return internalFailure(
        'word-rush individual answer',
        new Error(`unexpected outcome ${String(outcome)}`),
        'Could not record your answer'
      )
    }

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

  const name = await playerName(supabase, gameId, playerId)
  const nextPromptIndex = session.prompt_index + 1
  const auto = session.prompt_mode === 'automatic' ? nextAutoPrompt(session.used_pairs, session.min_word_length) : null
  const nextPhase: WordRushPhase = session.prompt_mode === 'manual' ? 'awaiting_prompt' : 'playing'
  const minHint = wordRushMinLengthHint(session.min_word_length)

  const { data: claimed } = await supabase
    .from('word_rush_sessions')
    .update({
      phase: nextPhase,
      prompt_index: nextPromptIndex,
      start_letter: auto?.start ?? null,
      end_letter: auto?.end ?? null,
      used_pairs: auto ? [...session.used_pairs, auto.key] : session.used_pairs,
      status_message: `${name} got it! ${auto ? `Starts with ${auto.start.toUpperCase()}, Ends with ${auto.end.toUpperCase()}${minHint}` : 'Next letters…'}`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    // Bound to the session this call inspected: a replacement session (Play Again reuses the game id and can reuse the
    // turn index) must match no row.
    .eq('id', session.id)
    .eq('phase', 'playing')
    .eq('turn_index', session.turn_index)
    .eq('prompt_index', session.prompt_index)
    .select('id')

  if (!claimed?.length) {
    return { error: 'Your team already solved this pair — check the new letters' }
  }

  const { error: answerError } = await supabase.from('word_rush_answers').insert({
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
  // Don't swallow a failed insert: the team score is a count of answer rows, so a
  // dropped row silently stalls the score even though the word was accepted.
  if (answerError) {
    return internalFailure('word-rush team answer', answerError, 'Could not record your answer')
  }

  return { correct: true }
}

async function endTeamTurn(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession,
  leaverId?: string
): Promise<{ error?: string; internal?: boolean; finished?: boolean }> {
  const totalTeamTurns = wordRushTotalTeamTurns(session.num_teams, session.total_rounds)

  const { count } = await supabase
    .from('word_rush_answers')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('team', session.active_team)
    .eq('team_turn_index', session.turn_index)
    .eq('correct', true)

  const teamScore = count ?? 0
  const finishedRound = session.current_round
  const teamRows = await loadTeamRows(supabase, gameId)

  // Skip any team that can no longer field a turn; once at most one team can
  // still play, the game is decided.
  const playable = new Set(wordRushPlayableTeams(teamRoster(teamRows), session.num_teams, session.prompt_mode))
  const nextTurn =
    playable.size <= 1
      ? totalTeamTurns
      : nextPlayableTeamTurnIndex(session.turn_index + 1, session.num_teams, session.total_rounds, playable)

  if (nextTurn >= totalTeamTurns) {
    const message = playable.size <= 1 ? 'Not enough teams left to continue' : 'All rounds complete!'
    return finishWordRushGame(supabase, gameId, session, message, leaverId)
  }

  const nextTeam = teamForTurnIndex(nextTurn, session.num_teams)
  const nextRound = currentTeamRoundNumber(nextTurn, session.num_teams)
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
    difficulty: session.difficulty,
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
    // Bound to the session this call inspected: a replacement session (Play Again reuses the game id and can reuse the
    // turn index) must match no row.
    .eq('id', session.id)
    .eq('turn_index', session.turn_index)
  if (error) return internalFailure('word-rush:end-team-turn', error)
  return {}
}

async function endIndividualRound(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession,
  leaverId?: string
): Promise<{ error?: string; internal?: boolean; finished?: boolean }> {
  const { data: correctGuesses, error: guessesError } = await supabase
    .from('word_rush_answers')
    .select('player_id, created_at, text')
    .eq('game_id', gameId)
    .eq('turn_index', session.turn_index)
    .eq('correct', true)
  if (guessesError) return internalFailure('word-rush:end-individual-round:guesses', guessesError)

  const setterId = session.prompt_setter_player_id
  const guessedCount = tallyIndividualGuesses(
    correctGuesses,
    setterId,
    session.turn_deadline_at,
    session.turn_seconds
  ).count

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
        difficulty: session.difficulty,
        promptSetterId: nextSetter,
        usedPairs: session.used_pairs,
      })

  const statusMessage = isLastRound
    ? 'All rounds complete!'
    : `Round ${session.current_round} complete — ${guessedCount} guessed it`

  // What the round's effects need once this row has moved on to the next round. Written in the same
  // UPDATE as the claim so "round closed" and "effects owed" can never be out of step.
  const pending: WordRushRoundFinalize = {
    session_id: session.id,
    turn_index: session.turn_index,
    round: session.current_round,
    setter_id: setterId,
    is_last: isLastRound,
    turn_deadline_at: session.turn_deadline_at,
    turn_seconds: session.turn_seconds,
    awarded: false,
    ...(leaverId ? { leaver_id: leaverId } : {}),
  }

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
      round_finalize: pending,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('id', session.id)
    .eq('turn_index', session.turn_index)
    .in('phase', ['playing', 'awaiting_prompt'])
    // Never overwrite a previous round's still-owed effects (loadSession resumes them first).
    .is('round_finalize', null)
    .select('id')

  if (error) return internalFailure('word-rush:end-individual-round', error)
  if (!claimed?.length) return {}

  // Answer admission checks the phase under a row lock, so once the claim has landed no new answer
  // can be admitted: finalization reads the final answer set. It is safe to fail from here on — the
  // marker stays and the next request that loads the session resumes it (see loadSession). The
  // round itself has ended, so report success to this caller.
  const finalized = await runRoundFinalization(supabase, gameId, pending)
  // `finished`: THIS call closed the last round AND its finalization won the game-row transition, so the game finish is
  // its own (an independent finish that landed first, or a finalization that must be resumed, is not).
  return { finished: isLastRound && finalized.gameFinishWon === true }
}

/**
 * Resume the effects of a round that was closed but not finalized, for one game. Safe to call at any
 * time and from anyone: it only completes work the marker says is owed, every step is idempotent, and
 * it does nothing when no marker is set. Unlike loadSession's silent resume this reports the outcome,
 * and it does not look at games.status (the marker can outlive the game finish if clearing it failed).
 */
export async function resumeWordRushFinalization(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ resumed: boolean; error?: string; internal?: boolean }> {
  const { data, error } = await supabase
    .from('word_rush_sessions')
    .select('round_finalize')
    .eq('game_id', gameId)
    .maybeSingle()
  if (error) return { resumed: false, ...internalFailure('word-rush:resume-finalization:load', error) }
  const pending = (data as { round_finalize?: WordRushRoundFinalize | null } | null)?.round_finalize
  if (!pending) return { resumed: false }
  const result = await runRoundFinalization(supabase, gameId, pending)
  if (result.error) return { resumed: false, ...result }
  return { resumed: true }
}

/**
 * Server-side backstop: resume every game's pending finalization, with no client involved. Needed
 * because after the last round the session is `finished`, so the clients' timers stop and nothing
 * else would load the session again. Bounded per call; the next tick takes the rest.
 */
export async function resumeAllWordRushFinalizations(
  supabase: SupabaseClient,
  limit = 20
): Promise<{ resumed: number; failed: number }> {
  const { data, error } = await supabase
    .from('word_rush_sessions')
    .select('game_id, round_finalize')
    .not('round_finalize', 'is', null)
    .limit(limit)
  if (error) {
    internalFailure('word-rush:resume-all-finalizations', error)
    return { resumed: 0, failed: 1 }
  }
  let resumed = 0
  let failed = 0
  for (const row of (data ?? []) as Array<{ game_id: string; round_finalize: WordRushRoundFinalize | null }>) {
    if (!row.round_finalize) continue
    const result = await runRoundFinalization(supabase, row.game_id, row.round_finalize)
    if (result.error) failed += 1
    else resumed += 1
  }
  return { resumed, failed }
}

async function finishWordRushGame(
  supabase: SupabaseClient,
  gameId: string,
  session: WordRushSession,
  message: string,
  leaverId?: string
): Promise<{ error?: string; internal?: boolean; finished?: boolean }> {
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
    // The session the caller inspected: a stale call matches nothing (a replacement session is never marked finished).
    .eq('id', session.id)
    .neq('status', 'finished')
    .select('id')
  if (error) return internalFailure('word-rush:finish', error)
  if (!claimed?.length) return {}
  // Bound to the session this claim won: a stale call must never finish a replacement session started on the same game
  // id (the round finalizer binds its finish the same way; the function also writes the bookkeeping marker itself).
  const { won } = await markGameFinished(supabase, gameId, undefined, {
    roundGuard: {
      rpc: 'word_rush_finish_game_for_session',
      params: { p_session_id: session.id, ...(leaverId ? { p_leaver_player_id: leaverId } : {}) },
    },
    trackBookkeeping: true,
  })
  return { finished: won }
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
    // Bound to the session this call inspected: a replacement session (Play Again reuses the game id and can reuse the
    // turn index) must match no row.
    .eq('id', session.id)
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

  // The `finished` marker is for the removal sync only; these callers report just the outcome.
  const ended =
    session.mode === 'team'
      ? await endTeamTurn(supabase, gameId, session)
      : await endIndividualRound(supabase, gameId, session)
  return ended.error ? { error: ended.error, internal: ended.internal } : {}
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

  // The `finished` marker is for the removal sync only; these callers report just the outcome.
  const ended =
    session.mode === 'team'
      ? await endTeamTurn(supabase, gameId, session)
      : await endIndividualRound(supabase, gameId, session)
  return ended.error ? { error: ended.error, internal: ended.internal } : {}
}

function individualPlayingStatusMessage(
  session: Pick<WordRushSession, 'current_round' | 'start_letter' | 'end_letter' | 'min_word_length'>
): string {
  const minHint = wordRushMinLengthHint(session.min_word_length)
  if (session.start_letter && session.end_letter) {
    return `Round ${session.current_round} — Starts with ${session.start_letter.toUpperCase()}, Ends with ${session.end_letter.toUpperCase()}${minHint}`
  }
  return `Round ${session.current_round} — enter the letter pair${minHint}`
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
        ? `Round ${session.current_round} — ${teamLabel(session.active_team)} — Starts with ${session.start_letter.toUpperCase()}, Ends with ${session.end_letter.toUpperCase()}${wordRushMinLengthHint(session.min_word_length)}`
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
    // Bound to the session this call inspected: a replacement session (Play Again reuses the game id and can reuse the
    // turn index) must match no row.
    .eq('id', session.id)
    .eq('phase', 'intermission')
  if (updateError) return internalFailure('word-rush:advance', updateError)
  return {}
}

export async function syncWordRushAfterPlayerRemoved(
  supabase: SupabaseClient,
  gameId: string,
  removedPlayerId: string
): Promise<{
  error?: string
  internal?: boolean
  rollback?: WordRushRosterSnapshot
  /** This removal ended the session's last round / the game itself (not an independent finish). */
  ownFinish?: boolean
  /**
   * The game session the reconciliation was decided against. The session row it worked on was loaded and verified to
   * belong to exactly this identity (the game row is read before AND after the load, and every write is bound to the
   * session id), so an own finish is always paired with the session it really finished.
   */
  gameSession?: { startedAt: string | null; sessionsPlayed: number | null }
}> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('status, session_started_at, sessions_played')
      .eq('id', gameId)
      .maybeSingle()
    // An unreadable game is NOT "not active": reconciling nothing would let the seat go while the roster keeps it.
    if (gameError) return internalFailure('word-rush:remove-player:game', gameError)
    const gameSession = game
      ? { startedAt: game.session_started_at ?? null, sessionsPlayed: game.sessions_played ?? null }
      : undefined
    const result = await syncWordRushRemoval(supabase, gameId, removedPlayerId, game?.status ?? null, gameSession)
    // A start / replay landed while this reconciled: nothing was written for the stale session, so read again.
    if (result.stale) continue
    const { stale: _stale, ...rest } = result
    void _stale
    return { ...rest, ...(gameSession ? { gameSession } : {}) }
  }
  return { error: 'The game changed while you were leaving — try again', internal: false }
}

async function syncWordRushRemoval(
  supabase: SupabaseClient,
  gameId: string,
  removedPlayerId: string,
  gameStatus: string | null,
  gameSession: { startedAt: string | null; sessionsPlayed: number | null } | undefined
): Promise<{
  error?: string
  internal?: boolean
  rollback?: WordRushRosterSnapshot
  ownFinish?: boolean
  /** The game moved to another session while this ran (nothing was written for the old one). */
  stale?: boolean
}> {
  if (gameStatus !== 'active') return {}

  const { session, error, internal } = await loadSession(supabase, gameId)
  if (error) return { error, internal }
  if (!session || session.status === 'finished') return {}

  // The session row was loaded after the game row was read: confirm the game is still the same session generation.
  const { data: again, error: againError } = await supabase
    .from('games')
    .select('session_started_at, sessions_played')
    .eq('id', gameId)
    .maybeSingle()
  if (againError) return internalFailure('word-rush:remove-player:game', againError)
  if (
    gameSession &&
    (!again ||
      (again.session_started_at ?? null) !== gameSession.startedAt ||
      (again.sessions_played ?? null) !== gameSession.sessionsPlayed)
  ) {
    return { stale: true }
  }

  const newRoster = session.roster.filter((id) => id !== removedPlayerId)
  // The roster may already lack the player (an earlier attempt took them off) while they are STILL the prompt setter of a
  // round that awaits its prompt: deleting the seat would then null the setter and nobody could enter the letters. That
  // case is not "nothing to do": the setter is reassigned below (the database does the same before any seat delete).
  const setterGone = session.prompt_setter_player_id === removedPlayerId && session.phase === 'awaiting_prompt'
  const rosterUnchanged = newRoster.length === session.roster.length
  if (rosterUnchanged && !setterGone) return {}

  const sessionPatch: Partial<WordRushSession> = { roster: newRoster }

  // Only pick a new letter-setter before letters are live — during playing keep the
  // removed setter id so mirror scoring and answerer eligibility stay consistent.
  if (session.prompt_setter_player_id === removedPlayerId && session.phase === 'awaiting_prompt') {
    if (session.mode === 'individual' && session.prompt_mode === 'manual') {
      sessionPatch.prompt_setter_player_id = promptSetterForIndividualRound(newRoster, session.turn_index)
    } else if (session.mode === 'team' && session.prompt_mode === 'manual') {
      const teamRows = await loadTeamRows(supabase, gameId)
      const members = (teamRoster(teamRows).get(session.active_team) ?? []).filter((id) => id !== removedPlayerId)
      const roundIndex = teamRoundIndexFromTurn(session.turn_index, session.num_teams)
      sessionPatch.prompt_setter_player_id = promptSetterForTeamRound(members, roundIndex)
    } else {
      sessionPatch.prompt_setter_player_id = null
    }
  }

  // What a failed delete must put back: ONLY this player (at their old position) and, if this removal reassigned the
  // prompt setter, the setter it replaced. Never the whole saved roster: other players may leave in between.
  const rollback: WordRushRosterSnapshot = {
    session_id: session.id,
    removed_player_id: removedPlayerId,
    removed_index: session.roster.indexOf(removedPlayerId),
    turn_index: session.turn_index,
    prompt_setter_player_id: session.prompt_setter_player_id,
    ...('prompt_setter_player_id' in sessionPatch
      ? { setter_after: sessionPatch.prompt_setter_player_id ?? null }
      : {}),
  }

  // A compare-and-swap in the database under the session row lock: the new roster was computed from the roster this
  // call READ, so it is written only while the session still has exactly that roster / turn / phase / setter. A seat
  // restore that committed in between (word_rush_restore_roster_member) is never overwritten by a whole-array write
  // computed from the older roster; the caller reads again instead (`stale`). A replaced session matches no row.
  // A setter-only change (the roster already lacked the player) records no rollback: the earlier attempt's snapshot still
  // describes the roster change and is kept by the caller.
  const { data: applied, error: updateError } = await supabase.rpc('word_rush_remove_roster_member', {
    p_game_id: gameId,
    p_session_id: session.id,
    p_expected_roster: session.roster,
    p_expected_turn_index: session.turn_index,
    p_expected_phase: session.phase,
    p_expected_setter: session.prompt_setter_player_id ?? null,
    p_new_roster: newRoster,
    p_set_setter: 'prompt_setter_player_id' in sessionPatch,
    p_new_setter: sessionPatch.prompt_setter_player_id ?? null,
  })
  // A lost response may still have committed the write: return the snapshot so the route can restore the roster (the restore is
  // idempotent when nothing was written).
  if (updateError) return { ...internalFailure('word-rush:remove-player', updateError), rollback }
  // `roster_changed` / `no_session`: nothing was written for this read of the session, so go and read it again.
  if ((applied as { status?: string } | null)?.status !== 'applied') return { stale: true }

  const updatedSession = { ...session, ...sessionPatch }
  if (rosterUnchanged) return {}
  // The roster change is committed from here on: ANY failure below (a thrown read inside the round-ending helpers included)
  // must come back as an error WITH the rollback, never as an exception that skips the route's compensation.
  try {
    if (
      updatedSession.mode === 'individual' &&
      (updatedSession.phase === 'playing' || updatedSession.phase === 'awaiting_prompt')
    ) {
      const eligible = wordRushIndividualAnswerers(updatedSession)
      const { data: roundAnswers, error: answersError } = await supabase
        .from('word_rush_answers')
        .select('player_id, turn_index, correct')
        .eq('game_id', gameId)
        .eq('turn_index', session.turn_index)
      // The roster change is already written: an unreadable round must not be treated as "nobody answered".
      if (answersError) return { ...internalFailure('word-rush:remove-player:answers', answersError), rollback }

      const answers = (roundAnswers ?? []) as Array<{ player_id: string; turn_index: number; correct: boolean }>
      if (eligible.length === 0 || allWordRushIndividualPlayersSubmitted(updatedSession, answers)) {
        const endResult = await endIndividualRound(supabase, gameId, updatedSession, removedPlayerId)
        if (endResult.error) return { ...endResult, rollback }
        return { rollback, ownFinish: endResult.finished === true }
      }
    }

    if (
      updatedSession.mode === 'team' &&
      (updatedSession.phase === 'playing' || updatedSession.phase === 'awaiting_prompt')
    ) {
      let teamRows: Awaited<ReturnType<typeof loadTeamRows>>
      try {
        teamRows = await loadTeamRows(supabase, gameId)
      } catch (err) {
        return { ...internalFailure('word-rush:remove-player:teams', err), rollback }
      }
      const playable = new Set(
        wordRushPlayableTeams(teamRoster(teamRows), updatedSession.num_teams, updatedSession.prompt_mode)
      )
      // The active team can no longer field a turn, or only one team remains —
      // end this turn now (endTeamTurn skips the dead team / finishes the game)
      // rather than letting it run out the clock.
      if (playable.size <= 1 || !playable.has(updatedSession.active_team)) {
        const endResult = await endTeamTurn(supabase, gameId, updatedSession, removedPlayerId)
        if (endResult.error) return { ...endResult, rollback }
        return { rollback, ownFinish: endResult.finished === true }
      }
    }

    return { rollback }
  } catch (err) {
    return { ...internalFailure('word-rush:remove-player:reconcile', err), rollback }
  }
}

/**
 * The roster change made before a player delete, with the id of the session it was made on. A finish + Play Again +
 * Start between the removal and a revert replaces the session row (a new id under the same game id), so the revert is
 * bound to the snapshot's session and can never write onto a new one. It names ONE player: the revert re-adds only
 * that player, so another player who left the roster in the meantime is never put back without a seat.
 */
export type WordRushRosterSnapshot = {
  session_id: string
  removed_player_id: string
  removed_index: number
  /** The turn the removal happened in: the prompt setter is only put back while that turn still awaits its prompt. */
  turn_index: number
  /** The prompt setter before the removal. */
  prompt_setter_player_id: string | null
  /** The prompt setter THIS removal assigned, when it reassigned it (absent: it did not touch the setter). */
  setter_after?: string | null
}

/**
 * `restored` (put back), `not_current_session` (the session was replaced: nothing of the old one is ours to restore),
 * `no_seat` (the player no longer has a seat, so there is nothing to put back) or `failed` (the database could not be
 * reached after every attempt: the roster still lacks a player who kept their seat, which the caller must not call done).
 */
export type WordRushRestoreResult = 'restored' | 'not_current_session' | 'no_seat' | 'failed'

const RESTORE_ATTEMPTS = 3

export async function revertWordRushRosterAfterFailedPlayerDelete(
  supabase: SupabaseClient,
  gameId: string,
  snapshot: WordRushRosterSnapshot
): Promise<WordRushRestoreResult> {
  // One database step (word_rush_restore_roster_member): it re-adds just this player under the games + session row
  // locks (the same order as the seat removal), and restores the prompt setter only if it is still the one the removal
  // assigned. Idempotent, so a transport error is simply retried.
  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc('word_rush_restore_roster_member', {
      p_game_id: gameId,
      p_session_id: snapshot.session_id,
      p_player_id: snapshot.removed_player_id,
      p_index: snapshot.removed_index,
      p_turn_index: snapshot.turn_index,
      p_restore_setter: 'setter_after' in snapshot,
      p_setter_after: snapshot.setter_after ?? null,
      p_setter_before: snapshot.prompt_setter_player_id,
    })
    if (error) continue
    const status = (data as { status?: string } | null)?.status
    if (status === 'restored' || status === 'not_current_session' || status === 'no_seat') return status
  }
  console.error(`word-rush: restoring the roster of ${gameId} after a retained leave failed`)
  return 'failed'
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

/**
 * Whether the previous Word Rush game's effects are all applied: a closed round's owed effects and the finished game's own
 * bookkeeping (room points, trophy snapshot). Play Again calls this BEFORE its first destructive delete (the rows that
 * bookkeeping reads are among them) and the session clear below checks it again.
 */
export async function ensureWordRushGameFinalized(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  // Never reset while a closed round's effects are still owed: deleting the session drops the
  // marker and the answers the setter's points are computed from, so they could never be awarded.
  // Finish them first; if that fails, refuse the reset so Play Again can simply be retried.
  const owed = await resumeWordRushFinalization(supabase, gameId)
  if (owed.error) return { error: 'The previous game is still being finalized — try again in a moment' }
  // ...nor while the finished game's own bookkeeping is still reading these rows, whichever path finished it. Recover it
  // here; if it is still owed or held by a live runner, refuse the reset so Play Again can simply be retried.
  const bookkeeping = await recoverFinishBookkeeping(supabase, gameId)
  if (bookkeeping.state !== 'none' && bookkeeping.state !== 'done') {
    return { error: 'The previous game is still being finalized — try again in a moment' }
  }
  return {}
}

export async function clearWordRushSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; poolUsage?: Record<string, unknown> }> {
  const finalized = await ensureWordRushGameFinalized(supabase, gameId)
  if (finalized.error) return { error: finalized.error }

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
