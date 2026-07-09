import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import { clampWordRushMode, clampWordRushTeams, shuffleWordRushTeams } from '@/lib/word-rush'
import { persistWordRushTeamAssignment } from '@/lib/word-rush-server'
import { wordRushShuffleSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, wordRushShuffleSchema)
  if (bodyError) return bodyError
  const { gameId, hostToken } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status, word_rush_mode, word_rush_num_teams')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordRushGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Rush game' }, { status: 400 })
  }
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Teams are locked' }, { status: 400 })
  if (clampWordRushMode(game.word_rush_mode) !== 'team') {
    return NextResponse.json({ error: 'Team shuffle is only for team mode' }, { status: 400 })
  }

  const numTeams = clampWordRushTeams(game.word_rush_num_teams)
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', code)
    .eq('spectator', false)
    .order('joined_at')
  const playerIds = (players ?? []).map((p) => p.id as string)
  if (playerIds.length === 0) return NextResponse.json({ error: 'No players to shuffle' }, { status: 400 })

  const assignment = shuffleWordRushTeams(playerIds, numTeams)
  const { error, internal } = await persistWordRushTeamAssignment(supabase, code, assignment)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })

  return NextResponse.json({ success: true })
}
