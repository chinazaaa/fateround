import { NextRequest, NextResponse } from 'next/server'
import { isRummyGame, parseGameType } from '@/lib/game-types'
import { processRummyDiscard } from '@/lib/rummy'
import { rummyDiscardSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, rummyDiscardSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, cardId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isRummyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Rummy game' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processRummyDiscard(supabase, code, auth.player.id, cardId)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code, game)
  return NextResponse.json({ success: true })
}
