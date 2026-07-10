import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { isQuickDrawGuessVariant } from '@/lib/quick-draw'
import { updateQuickDrawGuessStrokes } from '@/lib/quick-draw-guess'
import { quickDrawGuessStrokesSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, quickDrawGuessStrokesSchema)
  if (bodyError) return bodyError
  const { gameId, resumeToken, strokeData } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, quick_draw_variant')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
    return NextResponse.json({ error: 'Not in guess mode' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true || auth.player.is_eliminated === true) {
    return NextResponse.json({ error: 'Spectators cannot draw' }, { status: 403 })
  }

  const { error, internal } = await updateQuickDrawGuessStrokes(supabase, code, auth.player.id, strokeData)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
