import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { describeItTeamSchema } from '@/lib/validation'
import { clampDescribeItTeams } from '@/lib/describe-it'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const parsed = describeItTeamSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { gameId, playerId, team } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, describe_it_num_teams')
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

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { error } = await supabase
    .from('describe_it_players')
    .upsert({ game_id: code, player_id: playerId, team }, { onConflict: 'game_id,player_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
