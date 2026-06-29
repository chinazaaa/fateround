import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isLudoGame } from '@/lib/game-types'
import { processLudoExpireTurn } from '@/lib/ludo'
import { ludoExpireSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processLudoExpireTurn), so there's
// no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, ludoExpireSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isLudoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Ludo game' }, { status: 400 })
  }

  const { error } = await processLudoExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
