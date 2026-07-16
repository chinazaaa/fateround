import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { parseLandmineMetadata, reviewTargetForMarker, normalizeAnswer } from '@/lib/landmine'
import { landmineMarkSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineMarkSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, valid } = body
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
  if (!metadata || metadata.phase !== 'marking') {
    return NextResponse.json({ error: 'Not in marking phase' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const markerId = auth.player.id

  // The target is assignment-driven — the marker can never choose whom they mark.
  const targetId = reviewTargetForMarker(metadata, markerId)
  if (!targetId) return NextResponse.json({ error: 'No review assignment for this player' }, { status: 400 })

  const { data: targetAnswer } = await supabase
    .from('landmine_answers')
    .select('answer')
    .eq('round_id', roundId)
    .eq('player_id', targetId)
    .maybeSingle()

  // Empty answers are forced Void; peers only judge non-empty answers.
  const clamped = normalizeAnswer(targetAnswer?.answer) ? valid : false

  const now = new Date().toISOString()
  const { error } = await supabase.from('landmine_marks').upsert(
    {
      game_id: code,
      round_id: roundId,
      marker_player_id: markerId,
      target_player_id: targetId,
      valid: clamped,
      marked_at: now,
    },
    { onConflict: 'marker_player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: internalErrorMessage('landmine/mark', error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
