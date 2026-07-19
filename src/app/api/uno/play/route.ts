import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isUnoGame } from '@/lib/game-types'
import { processUnoPlay } from '@/lib/uno'
import { unoPlaySchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, unoPlaySchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, cardId, callUno } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isUnoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an UNO game' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processUnoPlay(supabase, code, auth.player.id, cardId, callUno === true)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code)

  return NextResponse.json({ success: true })
}
