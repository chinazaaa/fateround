import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isChessGame } from '@/lib/game-types'
import { processChessExpireTurn } from '@/lib/chess'
import { chessExpireSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processChessExpireTurn), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, chessExpireSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isChessGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Chess game' }, { status: 400 })
  }

  const { error } = await processChessExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
