import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { describeItTeamSchema } from '@/lib/validation'
import { clampDescribeItTeams } from '@/lib/describe-it'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, describeItTeamSchema)
  if (bodyError) return bodyError
  const { gameId, resumeToken, hostToken, playerId, team } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, describe_it_num_teams, host_token')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isDescribeItGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Text Charades game' }, { status: 400 })
  }
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Teams are locked' }, { status: 400 })
  if (team > clampDescribeItTeams(game.describe_it_num_teams)) {
    return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
  }

  // Two auth paths: the host may reassign any player (hostToken + target playerId);
  // otherwise a player assigns themselves, authorized by their secret resume_token.
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
    .from('describe_it_players')
    .upsert({ game_id: code, player_id: targetPlayerId, team }, { onConflict: 'game_id,player_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
