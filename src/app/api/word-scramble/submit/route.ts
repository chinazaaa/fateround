import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { finishExpiredWordScrambleGame, finishWordScrambleIfAnyPlayerDone } from '@/lib/word-scramble-finish'
import { wordScrambleGameSessionExpired, parseWordScrambleMetadata, guessMatchesAnswer } from '@/lib/word-scramble'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  scrambleIndex: z.number().int().min(0).max(200),
  // The typed answer. Ignored (and the answer revealed) when `hint` is true.
  guess: z.string().max(80).optional(),
  // A hint reveals (and locks in) the current answer for a small penalty.
  hint: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, scrambleIndex } = body
  const hint = body.hint === true
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, session_started_at, game_duration_seconds')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (wordScrambleGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    await finishExpiredWordScrambleGame(supabase, game)
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true) {
    return NextResponse.json({ error: 'Spectators cannot play' }, { status: 403 })
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, word_scramble_metadata')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  const meta = parseWordScrambleMetadata(round?.word_scramble_metadata)
  if (!round || !meta) return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  if (scrambleIndex >= meta.count) return NextResponse.json({ error: 'No such scramble' }, { status: 400 })

  const { data: solutionRow } = await supabase
    .from('word_scramble_solutions')
    .select('solution')
    .eq('round_id', round.id)
    .maybeSingle()
  const answers = (solutionRow?.solution as string[] | undefined) ?? undefined
  if (!answers) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })
  const answer = answers[scrambleIndex]
  if (!answer) return NextResponse.json({ error: 'No such scramble' }, { status: 400 })

  // Already solved this scramble → friendly no-op (returns the answer so the client advances).
  const { data: existing } = await supabase
    .from('word_scramble_solves')
    .select('id')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
    .eq('scramble_index', scrambleIndex)
    .maybeSingle()
  if (existing) return NextResponse.json({ correct: true, word: answer, alreadySolved: true })

  if (!hint && !guessMatchesAnswer(body.guess ?? '', answer)) {
    return NextResponse.json({ correct: false })
  }

  const { error: insertError } = await supabase.from('word_scramble_solves').insert({
    game_id: code,
    round_id: round.id,
    player_id: auth.player.id,
    scramble_index: scrambleIndex,
    word: answer,
    via_hint: hint,
  })
  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('word-scramble/submit', insertError) }, { status: 500 })
  }

  // A new solve can complete the round — re-check the race win condition.
  const { error: finishError } = await finishWordScrambleIfAnyPlayerDone(supabase, code)
  if (finishError) {
    return NextResponse.json(
      { error: internalErrorMessage('word-scramble/submit completeness check', finishError) },
      { status: 500 }
    )
  }

  return NextResponse.json({ correct: true, word: answer, hint })
}
