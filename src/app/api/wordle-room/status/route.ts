import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWordleRoomMetadata, wordleRoomMaxAttemptsForWord, wordleRoomTimeRemainingMs } from '@/lib/wordle-room'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const statusSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
})

/**
 * Reveals the player's CURRENT word (never the rest of the sequence) plus their progress
 * and the room timer. The client grades guesses locally and reads live standings from
 * `wordle_room_progress`, but the current word only ever leaves the server here — the full
 * sequence lives in the RLS-locked solutions table.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, statusSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const supabase = getSupabaseAdmin()

  const [{ data: game }, { data: round }] = await Promise.all([
    supabase.from('games').select('id,status,session_started_at,timer_seconds').eq('id', gameId).maybeSingle(),
    supabase.from('rounds').select('id,wordle_room_metadata').eq('game_id', gameId).eq('round_number', 1).maybeSingle(),
  ])

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const metadata = parseWordleRoomMetadata(round.wordle_room_metadata)
  if (!metadata) return NextResponse.json({ error: 'Room data missing' }, { status: 500 })

  const [{ data: solutions }, { data: progress }] = await Promise.all([
    supabase.from('wordle_room_solutions').select('words').eq('round_id', round.id).maybeSingle(),
    supabase
      .from('wordle_room_progress')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_id', round.id)
      .eq('player_id', auth.player.id)
      .maybeSingle(),
  ])

  const words = Array.isArray(solutions?.words) ? (solutions.words as string[]) : []

  // A late-joined player has no progress row yet — start them at word one.
  const wordIndex = progress?.word_index ?? 0
  const currentWord = words[wordIndex]
  if (!currentWord) {
    return NextResponse.json({
      success: true,
      gameId,
      status: game.status,
      finished: true,
      word_count: metadata.word_count,
      category: metadata.category,
      categoryLabel: metadata.categoryLabel,
    })
  }

  // The player's own guesses on the CURRENT word — returned so a refresh (or a second
  // device) can restore the graded tiles. Only the current word's rows are exposed, and
  // the player already knows the current word, so nothing about the rest of the hidden
  // sequence leaks here.
  const { data: guessRows } = await supabase
    .from('wordle_room_guesses')
    .select('guess,state,is_correct,points_awarded,submitted_at')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
    .eq('word_index', wordIndex)
    .order('submitted_at', { ascending: true })

  return NextResponse.json({
    success: true,
    gameId,
    status: game.status,
    finished: progress?.finished === true,
    word_index: wordIndex,
    currentWord,
    wordLength: currentWord.length,
    maxAttempts: wordleRoomMaxAttemptsForWord(currentWord),
    guessesThisWord: progress?.current_word_guesses ?? guessRows?.length ?? 0,
    guesses: (guessRows ?? []).map((r) => ({ guess: r.guess, state: r.state })),
    words_solved: progress?.words_solved ?? 0,
    total_guesses: progress?.total_guesses ?? 0,
    word_count: metadata.word_count,
    category: metadata.category,
    categoryLabel: metadata.categoryLabel,
    timeRemainingMs: wordleRoomTimeRemainingMs(game.session_started_at, game.timer_seconds ?? 0),
    hasProgressRow: Boolean(progress),
  })
}
