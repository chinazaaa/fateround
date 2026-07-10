import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { isQuickDrawGuessVariant } from '@/lib/quick-draw'
import { clampQuickDrawNumTeams } from '@/lib/quick-draw-guess'
import { internalErrorMessage } from '@/lib/api-errors'
import { quickDrawGuessTeamSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, quickDrawGuessTeamSchema)
  if (bodyError) return bodyError
  const { gameId, resumeToken, hostToken, playerId, team } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, quick_draw_variant, quick_draw_num_teams, host_token')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
    return NextResponse.json({ error: 'Not in guess mode' }, { status: 400 })
  }
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Teams are locked' }, { status: 400 })
  if (team > clampQuickDrawNumTeams(game.quick_draw_num_teams)) {
    return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
  }

  let targetPlayerId: string
  if (hostToken) {
    if (hostToken !== game.host_token) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!playerId) return NextResponse.json({ error: 'playerId is required for host assignment' }, { status: 400 })
    targetPlayerId = playerId
  } else {
    const auth = await assertPlayer(supabase, code, resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.player.spectator) return NextResponse.json({ error: 'Spectators cannot join a team' }, { status: 403 })
    targetPlayerId = auth.player.id
  }

  const { error } = await supabase
    .from('quick_draw_guess_players')
    .upsert({ game_id: code, player_id: targetPlayerId, team }, { onConflict: 'game_id,player_id' })
  if (error) return NextResponse.json({ error: internalErrorMessage('quick-draw:guess-team', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
