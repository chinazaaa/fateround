import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isCrazyEightsGame } from '@/lib/game-types'
import { processCrazyEightsChoose } from '@/lib/crazy-eights'
import { crazyEightsChooseSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, crazyEightsChooseSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, suit } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isCrazyEightsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Crazy Eights game' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processCrazyEightsChoose(supabase, code, auth.player.id, suit)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
