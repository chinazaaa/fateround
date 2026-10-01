import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { isQuickDrawGuessVariant } from '@/lib/quick-draw'
import { processQuickDrawGuessAdvance } from '@/lib/quick-draw-guess'
import { quickDrawGuessAdvanceSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { secretMatches } from '@/lib/secret-compare'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, quickDrawGuessAdvanceSchema)
  if (bodyError) return bodyError
  const code = data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('game_type, host_token, quick_draw_variant')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
    return NextResponse.json({ error: 'Not in guess mode' }, { status: 400 })
  }

  // `!!data.hostToken &&` still short-circuits: a token-less poll (the common case) does
  // no digest work at all, and `force` stays a strict boolean either way.
  const force = !!data.hostToken && (await secretMatches(data.hostToken, game.host_token))
  const { error, internal } = await processQuickDrawGuessAdvance(supabase, code, { force })
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
