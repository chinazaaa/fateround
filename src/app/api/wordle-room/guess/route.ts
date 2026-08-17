import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import {
  WORDLE_ROOM_MIN_GUESS_INTERVAL_MS,
  evaluateWordleRoomGuess,
  parseWordleRoomMetadata,
  validateWordleRoomGuess,
  wordleRoomMaxAttemptsForWord,
  wordleRoomSessionExpired,
} from '@/lib/wordle-room'
import { playerIsViewer } from '@/lib/viewers'
import { markGameFinished } from '@/lib/game-finish'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const guessSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  word: z.string().min(1).max(20),
})

/**
 * Server-authoritative guess route. The client grades locally for instant feedback, but this
 * route re-grades every submission against the hidden sequence (never trusts client state),
 * enforces a per-word min-duration floor, and advances the player's progress row.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, guessSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, word } = body
  const supabase = getSupabaseAdmin()

  const [{ data: game }, { data: round }] = await Promise.all([
    supabase.from('games').select('id,status,session_started_at,timer_seconds').eq('id', gameId).maybeSingle(),
    supabase.from('rounds').select('id,wordle_room_metadata').eq('game_id', gameId).eq('round_number', 1).maybeSingle(),
  ])

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }

  if (wordleRoomSessionExpired(game.session_started_at, game.timer_seconds)) {
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const player = auth.player

  if (playerIsViewer(player, game)) {
    return NextResponse.json({ error: 'Viewers cannot make guesses' }, { status: 403 })
  }

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const metadata = parseWordleRoomMetadata(round.wordle_room_metadata)
  if (!metadata) return NextResponse.json({ error: 'Room data missing' }, { status: 500 })

  const [{ data: solutions }, { data: existingProgress }] = await Promise.all([
    supabase.from('wordle_room_solutions').select('words').eq('round_id', round.id).maybeSingle(),
    supabase
      .from('wordle_room_progress')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_id', round.id)
      .eq('player_id', player.id)
      .maybeSingle(),
  ])

  const words = Array.isArray(solutions?.words) ? (solutions.words as string[]) : []
  if (words.length !== metadata.word_count) {
    return NextResponse.json(
      { error: internalErrorMessage('wordle-room/guess', null, 'Room setup incomplete') },
      { status: 500 }
    )
  }

  if (existingProgress?.finished === true) {
    return NextResponse.json({ error: 'You have already finished this room' }, { status: 400 })
  }

  const wordIndex = existingProgress?.word_index ?? 0
  const currentWord = words[wordIndex]
  if (!currentWord) {
    return NextResponse.json({ error: 'No word to guess' }, { status: 400 })
  }

  // Anti-cheat floor: a second guess on the same word faster than a human can type is
  // rejected server-side (the client enforces the same floor for UX).
  if (existingProgress) {
    const { data: lastGuess } = await supabase
      .from('wordle_room_guesses')
      .select('submitted_at')
      .eq('round_id', round.id)
      .eq('player_id', player.id)
      .eq('word_index', wordIndex)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (
      lastGuess &&
      Date.now() - new Date(lastGuess.submitted_at as string).getTime() < WORDLE_ROOM_MIN_GUESS_INTERVAL_MS
    ) {
      return NextResponse.json({ error: 'You are guessing too fast' }, { status: 429 })
    }
  }

  // Server re-grade — never trusts a client-supplied correctness or score.
  const validation = validateWordleRoomGuess(word, currentWord)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const maxAttempts = wordleRoomMaxAttemptsForWord(currentWord)
  const currentGuesses = existingProgress?.current_word_guesses ?? 0
  const result = evaluateWordleRoomGuess(
    wordIndex,
    currentGuesses,
    validation.states.every((s) => s === 'correct'),
    maxAttempts,
    metadata.word_count
  )

  const now = new Date().toISOString()
  const finishedAt = result.finished ? now : null
  const totalTimeMs =
    result.finished && game.session_started_at
      ? Math.max(0, Date.now() - new Date(game.session_started_at).getTime())
      : (existingProgress?.total_time_ms ?? null)

  const { data: inserted, error: insertError } = await supabase
    .from('wordle_room_guesses')
    .insert({
      game_id: gameId,
      round_id: round.id,
      player_id: player.id,
      word_index: wordIndex,
      guess: validation.normalized,
      state: validation.states,
      is_correct: result.solved,
      points_awarded: result.pointsAwarded,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('wordle-room/guess', insertError) }, { status: 500 })
  }

  // Advance progress. `total_guesses` only counts guesses across SOLVED words (a lost word's
  // attempts are excluded from the standings comparator), and per-word guess count resets on
  // advance. The first progress row for a late-joined player is created here.
  const nextProgress = {
    game_id: gameId,
    round_id: round.id,
    player_id: player.id,
    word_index: result.nextWordIndex,
    current_word_guesses: result.nextWordIndex === wordIndex ? result.guessesUsed : 0,
    words_solved: (existingProgress?.words_solved ?? 0) + result.wordsSolvedDelta,
    total_guesses: (existingProgress?.total_guesses ?? 0) + (result.solved ? result.guessesUsed : 0),
    total_time_ms: totalTimeMs,
    finished: result.finished,
    finished_at: finishedAt,
    updated_at: now,
  }

  if (existingProgress) {
    const { error: updateError } = await supabase
      .from('wordle_room_progress')
      .update(nextProgress)
      .eq('id', existingProgress.id)
    if (updateError) {
      return NextResponse.json({ error: internalErrorMessage('wordle-room/guess', updateError) }, { status: 500 })
    }
  } else {
    const { error: createError } = await supabase.from('wordle_room_progress').insert({
      ...nextProgress,
      created_at: now,
    })
    if (createError) {
      return NextResponse.json({ error: internalErrorMessage('wordle-room/guess', createError) }, { status: 500 })
    }
  }

  // Untimed rooms run until every seated player has finished the sequence. A player who
  // has a progress row but is mid-sequence keeps the race open; the onlyIfActive CAS makes
  // the finishing request the single winner of the status transition + award pass.
  if (result.finished) {
    const { data: seatedProgress } = await supabase
      .from('wordle_room_progress')
      .select('player_id,finished')
      .eq('game_id', gameId)
      .eq('round_id', round.id)
    const everyoneDone = (seatedProgress?.length ?? 0) > 0 && (seatedProgress ?? []).every((p) => p.finished === true)
    if (everyoneDone) {
      await markGameFinished(supabase, gameId, now, { onlyIfActive: true })
    }
  }

  return NextResponse.json({
    success: true,
    solved: result.solved,
    pointsAwarded: result.pointsAwarded,
    guessesUsed: result.guessesUsed,
    maxAttempts,
    wordIndex: result.nextWordIndex,
    wordsSolved: nextProgress.words_solved,
    finished: result.finished,
    nextWord: result.finished ? null : (words[result.nextWordIndex] ?? null),
    guessId: inserted.id,
  })
}
