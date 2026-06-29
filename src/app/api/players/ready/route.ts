import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const schema = z.object({
  gameId: z.string().min(2).max(12),
  // Self-action: the player marks themselves ready — authorized by their resume_token.
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const gameCode = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id, status').eq('id', gameCode).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game is not in the lobby' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, gameCode, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('id', auth.player.id)
    .eq('game_id', gameCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
