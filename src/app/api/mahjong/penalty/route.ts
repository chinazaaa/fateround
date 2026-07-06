import { NextRequest, NextResponse } from 'next/server'
import { isMahjongGame, parseGameType } from '@/lib/game-types'
import { processMahjongPenalty } from '@/lib/mahjong'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { mahjongPenaltySchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = mahjongPenaltySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, playerId, penaltyType } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, status, game_type')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }
  if (penaltyType !== 'chombo') return NextResponse.json({ error: 'Unsupported penalty' }, { status: 400 })

  const { error } = await processMahjongPenalty(supabase, code, playerId)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
