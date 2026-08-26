import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isGoFishGame } from '@/lib/game-types'
import { processGoFishRefill } from '@/lib/gofish-server'
import { gofishActionSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

/**
 * Draw a fresh hand when the active player starts their turn with 0 cards and the ocean
 * still has cards. Physical-game rule: you draw again to stay in the game. Server does
 * the actual work; client just calls this on their turn when hand=0.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, gofishActionSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isGoFishGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Go Fish game' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error, drewCount } = await processGoFishRefill(supabase, code, auth.player.id)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true, drewCount: drewCount ?? 0 })
}
