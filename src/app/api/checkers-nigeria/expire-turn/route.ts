import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isCheckersNigeriaGame } from '@/lib/game-types'
import { processDraughts10ExpireTurn } from '@/lib/draughts10'
import { checkersExpireSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { scheduleTurnNotification } from '@/lib/push'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processDraughts10ExpireTurn), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, checkersExpireSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCheckersNigeriaGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Nigerian Checkers game' }, { status: 400 })
  }

  const { error } = await processDraughts10ExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code)

  return NextResponse.json({ success: true })
}
