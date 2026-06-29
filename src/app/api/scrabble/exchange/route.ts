import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isScrabbleGame } from '@/lib/game-types'
import { processScrabbleExchange } from '@/lib/scrabble'
import { scrabbleExchangeSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, scrabbleExchangeSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, tileIndices } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isScrabbleGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Scrabble game' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processScrabbleExchange(supabase, code, auth.player.id, tileIndices)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
