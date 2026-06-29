import { NextRequest, NextResponse } from 'next/server'
import { codewordsRoleSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, codewordsRoleSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, team, role } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

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
    return NextResponse.json(
      { error: 'The host picks spymasters for this game — teams are shuffled at start' },
      { status: 403 }
    )
  }
  if (game.codewords_player_picks === false) {
    return NextResponse.json({ error: 'The host assigns teams and roles for this game' }, { status: 403 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

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

  if (role === 'spymaster') {
    const { data: existingSpymaster } = await supabase
      .from('codewords_player_roles')
      .select('player_id')
      .eq('game_id', code)
      .eq('team', team)
      .eq('role', 'spymaster')
      .maybeSingle()

    if (existingSpymaster && existingSpymaster.player_id !== playerId) {
      return NextResponse.json(
        { error: `${team === 'red' ? 'Red' : 'Blue'} team already has a spymaster` },
        { status: 400 }
      )
    }
  }

  const { data: roleRow, error } = await supabase
    .from('codewords_player_roles')
    .upsert({ game_id: code, player_id: playerId, team, role }, { onConflict: 'game_id,player_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, role: roleRow })
}
