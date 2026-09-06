import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMahjongGame } from '@/lib/game-types'
import { processMahjongDiscard } from '@/lib/mahjong'
import { mahjongDiscardSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { scheduleTurnNotification } from '@/lib/push'
import { verifyMahjongPlayerAccess } from '@/lib/mahjong-auth'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = mahjongDiscardSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, resumeToken, tile } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }
  const allowed = await verifyMahjongPlayerAccess(supabase, code, playerId, resumeToken)
  if (!allowed) return NextResponse.json({ error: 'Invalid player session' }, { status: 403 })

  const { error } = await processMahjongDiscard(supabase, code, playerId, tile)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code, game)

  return NextResponse.json({ success: true })
}
