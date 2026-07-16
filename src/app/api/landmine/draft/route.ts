import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { parseLandmineMetadata, trimLandmineAnswer } from '@/lib/landmine'
import { landmineDraftSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

// Autosave the in-progress answer without locking it (submitted_at stays null).
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineDraftSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, answer } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isLandmineGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Landmine game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'writing') {
    return NextResponse.json({ error: 'Not in writing phase' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator || auth.player.is_eliminated) {
    return NextResponse.json({ error: 'Not an active player' }, { status: 403 })
  }

  // Only write the draft when the answer isn't already locked in.
  const { data: existing } = await supabase
    .from('landmine_answers')
    .select('submitted_at')
    .eq('round_id', roundId)
    .eq('player_id', auth.player.id)
    .maybeSingle()
  if (existing?.submitted_at) return NextResponse.json({ success: true })

  const { error } = await supabase
    .from('landmine_answers')
    .upsert(
      { game_id: code, round_id: roundId, player_id: auth.player.id, answer: trimLandmineAnswer(answer) },
      { onConflict: 'player_id,round_id' }
    )
  if (error) return NextResponse.json({ error: internalErrorMessage('landmine/draft', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
