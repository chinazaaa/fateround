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
 * Reveals the current word's clue/definition for a one-time points penalty (a gentler nudge than
 * the full "Reveal answer"). Only a "hint used" flag is persisted (word_scramble_hints.letters =
 * 1); re-tapping costs nothing. Words without a clue can't be hinted and are never charged.
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

  const clue = (meta.hints?.[scrambleIndex] ?? '').trim()
  if (!clue) return NextResponse.json({ available: false, clue: '' })

  // Already used a hint (or already solved) → return the clue without charging again.
  const [{ data: existingSolve }, { data: existingHint }] = await Promise.all([
    supabase
      .from('word_scramble_solves')
      .select('id')
      .eq('round_id', round.id)
      .eq('player_id', auth.player.id)
      .eq('scramble_index', scrambleIndex)
      .maybeSingle(),
    supabase
      .from('word_scramble_hints')
      .select('letters')
      .eq('round_id', round.id)
      .eq('player_id', auth.player.id)
      .eq('scramble_index', scrambleIndex)
      .maybeSingle(),
  ])
  if (existingSolve || existingHint) return NextResponse.json({ available: true, clue, letters: 1 })

  const { error: upsertError } = await supabase.from('word_scramble_hints').upsert(
    {
      game_id: code,
      round_id: round.id,
      player_id: auth.player.id,
      scramble_index: scrambleIndex,
      letters: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,round_id,scramble_index' }
  )
  if (upsertError) {
    return NextResponse.json({ error: internalErrorMessage('word-scramble/hint', upsertError) }, { status: 500 })
  }

  return NextResponse.json({ available: true, clue, letters: 1 })
}
