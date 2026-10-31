import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import { assignWordRushTeam } from '@/lib/word-rush-server'
import { wordRushTeamSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { secretMatches } from '@/lib/secret-compare'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'

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
    if (!(await secretMatches(hostToken, game.host_token))) {
      return NextResponse.json({ error: 'Invalid host token' }, { status: 403 })
    }
    if (!playerId) return NextResponse.json({ error: 'playerId required for host reassignment' }, { status: 400 })
    const { data: target, error: targetError } = await supabase
      .from('players')
      .select('id, spectator')
      .eq('id', playerId)
      .eq('game_id', code)
      .maybeSingle()
    if (targetError) {
      return NextResponse.json({ error: internalErrorMessage('word-rush:team:target', targetError) }, { status: 500 })
    }
    if (!target) return NextResponse.json({ error: 'Player not in this game' }, { status: 404 })
    if (target.spectator) return NextResponse.json({ error: 'Spectators cannot join a team' }, { status: 403 })
    const { error, internal } = await assignWordRushTeam(supabase, code, target.id, team)
    if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
    return NextResponse.json({ success: true })
  }

  if (!resumeToken) return NextResponse.json({ error: 'resumeToken required' }, { status: 400 })
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator) return NextResponse.json({ error: 'Spectators cannot join a team' }, { status: 403 })

  const { error, internal } = await assignWordRushTeam(supabase, code, auth.player.id, team)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
