import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isAyoGame } from '@/lib/game-types'
import { processAyoExpireTurn } from '@/lib/ayo'
import { ayoExpireSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, ayoExpireSchema)
  if (bodyError) return bodyError

  const { gameId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isAyoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an Ayo game' }, { status: 400 })
  }

  const { error } = await processAyoExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })

  scheduleTurnNotification(code)

  return NextResponse.json({ success: true })
}
