import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import { processWordRushAdvance } from '@/lib/word-rush-server'
import { wordRushAdvanceSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, wordRushAdvanceSchema)
  if (bodyError) return bodyError
  const { gameId, hostToken } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isWordRushGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Rush game' }, { status: 400 })
  }

  const { error, internal } = await processWordRushAdvance(supabase, code, hostToken)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
