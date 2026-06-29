import { NextRequest, NextResponse } from 'next/server'
import { ttlGuessSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isTwoTruthsGame } from '@/lib/game-types'
import { parseTtlMetadata, TTL_GUESS_POINTS } from '@/lib/two-truths'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, ttlGuessSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, guessedIndex } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isTwoTruthsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a two truths game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (round.submitter_player_id === playerId) {
    return NextResponse.json({ error: 'You cannot guess on your own round' }, { status: 400 })
  }

  const metadata = parseTtlMetadata(round.ttl_metadata)
  if (!metadata) return NextResponse.json({ error: 'Invalid round data' }, { status: 400 })
  if (guessedIndex < 0 || guessedIndex > 2) {
    return NextResponse.json({ error: 'Invalid guess' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('ttl_guesses')
    .select('id')
    .eq('player_id', playerId)
    .eq('round_id', roundId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already guessed this round' }, { status: 400 })

  const isCorrect = guessedIndex === metadata.lie_index
  const points = isCorrect ? TTL_GUESS_POINTS : 0

  const { error } = await supabase.from('ttl_guesses').insert({
    game_id: code,
    round_id: roundId,
    player_id: playerId,
    guessed_index: guessedIndex,
    is_correct: isCorrect,
    points,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
