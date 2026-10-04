import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isUnoGame } from '@/lib/game-types'
import { processUnoTeamLeaveDecision } from '@/lib/uno'
import { unoTeamLeaveSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

// Team-Up: after a teammate leaves mid-round, the remaining partner either continues
// solo (1v2) or forfeits the round to the opposing team.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, unoTeamLeaveSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, decision } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isUnoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an UNO game' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await processUnoTeamLeaveDecision(supabase, code, auth.player.id, decision)
  if (error) return NextResponse.json({ error }, { status: 400 })

  if (decision === 'continue') scheduleTurnNotification(code, game)

  return NextResponse.json({ success: true })
}
