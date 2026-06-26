import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { balanceDescribeItTeams, clampDescribeItTeams } from '@/lib/describe-it'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const schema = z.object({
  gameId: z.string().trim().min(1).max(12),
  hostToken: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { gameId, hostToken } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status, describe_it_num_teams')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isDescribeItGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Describe It game' }, { status: 400 })
  }
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Teams are locked' }, { status: 400 })

  const numTeams = clampDescribeItTeams(game.describe_it_num_teams)

  const [{ data: players }, { data: existing }] = await Promise.all([
    supabase.from('players').select('id').eq('game_id', code).eq('spectator', false).order('joined_at'),
    supabase.from('describe_it_players').select('player_id, team').eq('game_id', code),
  ])

  const playerIds = (players ?? []).map((p) => p.id as string)
  const assignment = balanceDescribeItTeams(
    playerIds,
    (existing ?? []) as Array<{ player_id: string; team: number }>,
    numTeams
  )

  const rows = [...assignment.entries()].map(([player_id, team]) => ({ game_id: code, player_id, team }))
  if (rows.length > 0) {
    const { error } = await supabase.from('describe_it_players').upsert(rows, { onConflict: 'game_id,player_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
