import { NextRequest, NextResponse } from 'next/server'
import { isMahjongGame, parseGameType } from '@/lib/game-types'
import { processMahjongNextHand } from '@/lib/mahjong'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHostWith } from '@/lib/game-admin'
import { mahjongNextHandSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = mahjongNextHandSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // This route checks STATUS before game type (unlike the bingo/codewords routes), so the
  // helper's own status gate lands in exactly the right place; only the type check stays inline.
  const {
    game,
    error: authError,
    status: authStatus,
  } = await assertHostWith(supabase, code, hostToken, {
    allowedStatuses: ['active'],
    statusError: 'Game is not active',
  })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }

  const { error } = await processMahjongNextHand(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
