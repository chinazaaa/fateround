import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import { assignWordRushTeam } from '@/lib/word-rush-server'
import { wordRushTeamSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, wordRushTeamSchema)
  if (bodyError) return bodyError
  const { gameId, team, resumeToken, hostToken, playerId } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, host_token')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordRushGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Rush game' }, { status: 400 })
  }

  if (hostToken) {
    if (game.host_token !== hostToken) return NextResponse.json({ error: 'Invalid host token' }, { status: 403 })
    if (!playerId) return NextResponse.json({ error: 'playerId required for host reassignment' }, { status: 400 })
    const { error, internal } = await assignWordRushTeam(supabase, code, playerId, team)
    if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
    return NextResponse.json({ success: true })
  }

  if (!resumeToken) return NextResponse.json({ error: 'resumeToken required' }, { status: 400 })
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error, internal } = await assignWordRushTeam(supabase, code, auth.player.id, team)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
