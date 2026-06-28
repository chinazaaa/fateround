import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isSnakeAndLadderGame } from '@/lib/game-types'
import { processSnakeAndLadderExpireTurn } from '@/lib/snake-and-ladder'
import { snakeLadderExpireSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processSnakeAndLadderExpireTurn),
// so there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = snakeLadderExpireSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isSnakeAndLadderGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Snake & Ladder game' }, { status: 400 })
  }

  const { error } = await processSnakeAndLadderExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
