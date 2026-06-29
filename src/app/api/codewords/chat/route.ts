import { NextRequest, NextResponse } from 'next/server'
import { codewordsChatSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, codewordsChatSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, text } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  const { data: role } = await supabase
    .from('codewords_player_roles')
    .select('team, role')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!role || role.role !== 'operative') {
    return NextResponse.json({ error: 'Only operatives can chat' }, { status: 403 })
  }

  const { data: board } = await supabase.from('codewords_boards').select('winner').eq('game_id', code).maybeSingle()
  if (board?.winner) return NextResponse.json({ error: 'Game is over' }, { status: 400 })

  const { error } = await supabase.from('codewords_messages').insert({
    game_id: code,
    player_id: playerId,
    team: role.team,
    text: text.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
