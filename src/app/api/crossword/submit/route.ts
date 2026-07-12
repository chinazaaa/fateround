import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { finishExpiredCrosswordGame, finishCrosswordIfAnyPlayerDone } from '@/lib/crossword-finish'
import { crosswordGameSessionExpired, parseCrosswordMetadata } from '@/lib/crossword'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  row: z.number().int().min(0).max(30),
  col: z.number().int().min(0).max(30),
  letter: z.string().length(1),
  // A "reveal letter" hint fills the correct letter for a −2 point penalty.
  hint: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, row, col } = body
  const hint = body.hint === true
  const letter = body.letter.toUpperCase()
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, session_started_at, game_duration_seconds')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (crosswordGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    await finishExpiredCrosswordGame(supabase, game)
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true) {
    return NextResponse.json({ error: 'Spectators cannot fill the grid' }, { status: 403 })
  }

  // Load the round (public layout) and the server-only solution.
  const { data: round } = await supabase
    .from('rounds')
    .select('id, crossword_metadata')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  const meta = parseCrosswordMetadata(round?.crossword_metadata)
  if (!round || !meta) return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })

  if (row >= meta.size || col >= meta.size || meta.blocked[row]?.[col]) {
    return NextResponse.json({ error: 'Invalid cell' }, { status: 400 })
  }

  const { data: solutionRow } = await supabase
    .from('crossword_solutions')
    .select('solution')
    .eq('round_id', round.id)
    .maybeSingle()
  const solution = solutionRow?.solution as string[][] | undefined
  if (!solution) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  const correctLetter = String(solution[row]?.[col] ?? '').toUpperCase()
  if (!correctLetter) return NextResponse.json({ error: 'Invalid cell' }, { status: 400 })

  // A hint always fills the correct letter; a normal guess is checked against the solution.
  const submittedLetter = hint ? correctLetter : letter
  const isCorrect = submittedLetter === correctLetter

  // Don't double-write a cell this player already has correct.
  const { data: existing } = await supabase
    .from('crossword_submissions')
    .select('id')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
    .eq('cell_row', row)
    .eq('cell_col', col)
    .eq('is_correct', true)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ success: true, isCorrect: true, alreadySolved: true })
  }

  const { error: insertError } = await supabase.from('crossword_submissions').insert({
    game_id: code,
    round_id: round.id,
    player_id: auth.player.id,
    cell_row: row,
    cell_col: col,
    submitted_letter: submittedLetter,
    is_correct: isCorrect,
    via_hint: hint,
  })
  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('crossword/submit', insertError) }, { status: 500 })
  }

  // Only a correct letter can complete the grid — re-check the race win condition.
  if (isCorrect) {
    const { error: finishError } = await finishCrosswordIfAnyPlayerDone(supabase, code)
    if (finishError) {
      return NextResponse.json(
        { error: internalErrorMessage('crossword/submit completeness check', finishError) },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true, isCorrect, letter: submittedLetter, hint })
}
