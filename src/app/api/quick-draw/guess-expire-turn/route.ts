import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { isQuickDrawGuessVariant } from '@/lib/quick-draw'
import { processQuickDrawGuessExpireTurn } from '@/lib/quick-draw-guess'
import { quickDrawGuessAdvanceSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, quickDrawGuessAdvanceSchema)
  if (bodyError) return bodyError
  const code = data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('game_type, quick_draw_variant')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
    return NextResponse.json({ error: 'Not in guess mode' }, { status: 400 })
  }

  const { error, internal } = await processQuickDrawGuessExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
