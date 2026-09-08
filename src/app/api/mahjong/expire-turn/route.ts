import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMahjongGame } from '@/lib/game-types'
import { processMahjongExpireTurn } from '@/lib/mahjong'
import { mahjongExpireSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'

// System/timer route: any client (and the server-side ticker in src/lib/game-tick.ts) may
// poke it, but it only acts once the turn deadline has genuinely passed (enforced in
// processMahjongExpireTurn), so there's no per-player token to authorize. Writes go through
// the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, mahjongExpireSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }

  const { error } = await processMahjongExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code, game)

  return NextResponse.json({ success: true })
}
