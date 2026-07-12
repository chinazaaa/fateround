import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { finishExpiredWordScrambleGame } from '@/lib/word-scramble-finish'
import { wordScrambleGameSessionExpired, parseWordScrambleMetadata } from '@/lib/word-scramble'

const hintSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  scrambleIndex: z.number().int().min(0).max(200),
})

/**
 * Reveals one more letter of the current word for a per-letter points penalty. Hints are capped
 * at answer.length - 1 (the whole word is never revealed via hints — that's the "Reveal" button).
 * Only the letter COUNT is persisted (word_scramble_hints); the answer text is returned to the
 * caller but never stored, so it can't leak to other players.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, hintSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, scrambleIndex } = body
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
  const answer = answers?.[scrambleIndex]
  if (!answer) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  // Already solved → nothing to hint; hand back the answer so the client can advance.
  const { data: existingSolve } = await supabase
    .from('word_scramble_solves')
    .select('id')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
    .eq('scramble_index', scrambleIndex)
    .maybeSingle()
  if (existingSolve) return NextResponse.json({ letters: answer.length, prefix: answer, alreadySolved: true })

  const maxLetters = Math.max(0, answer.length - 1)

  const { data: existingHint } = await supabase
    .from('word_scramble_hints')
    .select('letters')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
    .eq('scramble_index', scrambleIndex)
    .maybeSingle()
  const current = (existingHint?.letters as number | undefined) ?? 0
  const nextLetters = Math.min(current + 1, maxLetters)

  // Only write when it actually increases (so re-tapping at the cap costs nothing extra).
  if (nextLetters > current) {
    const { error: upsertError } = await supabase.from('word_scramble_hints').upsert(
      {
        game_id: code,
        round_id: round.id,
        player_id: auth.player.id,
        scramble_index: scrambleIndex,
        letters: nextLetters,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,round_id,scramble_index' }
    )
    if (upsertError) {
      return NextResponse.json({ error: internalErrorMessage('word-scramble/hint', upsertError) }, { status: 500 })
    }
  }

  return NextResponse.json({
    letters: nextLetters,
    prefix: answer.slice(0, nextLetters),
    maxed: nextLetters >= maxLetters,
  })
}
