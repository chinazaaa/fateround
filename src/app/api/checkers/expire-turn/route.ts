import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isCheckersGame } from '@/lib/game-types'
import { processCheckersExpireTurn } from '@/lib/checkers'
import { checkersExpireSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processCheckersExpireTurn), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, checkersExpireSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCheckersGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Checkers game' }, { status: 400 })
  }

  const { error } = await processCheckersExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
