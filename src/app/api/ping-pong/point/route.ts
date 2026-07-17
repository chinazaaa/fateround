import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isPingPongGame } from '@/lib/game-types'
import { processPingPongPoint } from '@/lib/ping-pong'
import { pingPongPointSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, pingPongPointSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, scorer } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isPingPongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Ping Pong game' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processPingPongPoint(supabase, code, auth.player.id, scorer)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code)

  return NextResponse.json({ success: true })
}
