import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isTicTacToeGame } from '@/lib/game-types'
import { processTicTacToeExpireTurn } from '@/lib/tic-tac-toe'
import { ticTacToeExpireSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processTicTacToeExpireTurn), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = ticTacToeExpireSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isTicTacToeGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Tic-Tac-Toe game' }, { status: 400 })
  }

  const { error } = await processTicTacToeExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
