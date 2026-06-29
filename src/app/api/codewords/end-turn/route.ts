import { NextRequest, NextResponse } from 'next/server'
import { codewordsEndTurnSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { cluePhaseUpdate, otherTeam } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import type { CodewordsBoard } from '@/types'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, codewordsEndTurnSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

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
    return NextResponse.json({ error: 'Only operatives can end the turn' }, { status: 403 })
  }

  const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', code).maybeSingle()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const typedBoard = board as CodewordsBoard
  if (typedBoard.winner) return NextResponse.json({ error: 'Game is over' }, { status: 400 })
  if (typedBoard.current_turn !== role.team) {
    return NextResponse.json({ error: "Not your team's turn" }, { status: 400 })
  }
  if (!typedBoard.current_clue_word) {
    return NextResponse.json({ error: 'No active clue to end' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('codewords_boards')
    .update(cluePhaseUpdate(otherTeam(role.team), typedBoard.spymaster_timer_seconds ?? 60))
    .eq('id', typedBoard.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, board: updated })
}
