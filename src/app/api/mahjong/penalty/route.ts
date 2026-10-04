import { NextRequest, NextResponse } from 'next/server'
import { isMahjongGame, parseGameType } from '@/lib/game-types'
import { processMahjongPenalty } from '@/lib/mahjong'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHostWith } from '@/lib/game-admin'
import { mahjongPenaltySchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, mahjongPenaltySchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, playerId, penaltyType } = body
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
    columns: 'game_type',
  })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }
  if (penaltyType !== 'chombo') return NextResponse.json({ error: 'Unsupported penalty' }, { status: 400 })

  const { error } = await processMahjongPenalty(supabase, code, playerId)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
