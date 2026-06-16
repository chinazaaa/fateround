import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codewordsRoleSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = codewordsRoleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, team, role } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('game_type, status, codewords_player_picks, codewords_late_join, codewords_randomize_teams')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.codewords_randomize_teams === true) {
    return NextResponse.json({ error: 'The host picks spymasters for this game — teams are shuffled at start' }, { status: 403 })
  }
  if (game.codewords_player_picks === false) {
    return NextResponse.json({ error: 'The host assigns teams and roles for this game' }, { status: 403 })
  }

  const { data: existingRole } = await supabase
    .from('codewords_player_roles')
    .select('id')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()

  if (game.status === 'active' && game.codewords_late_join === true && !existingRole) {
    return NextResponse.json({ error: 'Late joiners are assigned a team automatically' }, { status: 403 })
  }
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Team picks are locked after the game starts' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found in this game' }, { status: 404 })

  if (role === 'spymaster') {
    const { data: existingSpymaster } = await supabase
      .from('codewords_player_roles')
      .select('player_id')
      .eq('game_id', code)
      .eq('team', team)
      .eq('role', 'spymaster')
      .maybeSingle()

    if (existingSpymaster && existingSpymaster.player_id !== playerId) {
      return NextResponse.json({ error: `${team === 'red' ? 'Red' : 'Blue'} team already has a spymaster` }, { status: 400 })
    }
  }

  const { data: roleRow, error } = await supabase
    .from('codewords_player_roles')
    .upsert(
      { game_id: code, player_id: playerId, team, role },
      { onConflict: 'game_id,player_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, role: roleRow })
}
