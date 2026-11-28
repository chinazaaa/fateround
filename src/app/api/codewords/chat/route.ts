import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
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

  // The status check above can be stale by now: the insert re-checks it under a lock on the game row, so a finish
  // either committed first (rejected) or waits for this insert and its session wipe removes the message.
  const { data: inserted, error } = await supabase.rpc('insert_codewords_message_if_active', {
    p_game_id: code,
    p_player_id: playerId,
    p_team: role.team,
    p_text: text.trim(),
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('codewords/chat', error) }, { status: 500 })
  if ((inserted as { status?: string } | null)?.status === 'game_not_active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
