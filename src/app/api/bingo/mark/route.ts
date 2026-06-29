import { NextRequest, NextResponse } from 'next/server'
import { bingoMarkSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { canMarkCell } from '@/lib/bingo'
import { playerIsViewer } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, bingoMarkSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, cellIndex } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('game_type, status, session_started_at')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id
  if (playerIsViewer(auth.player, game)) {
    return NextResponse.json({ error: 'Viewers cannot mark their card' }, { status: 403 })
  }

  const { data: card } = await supabase
    .from('bingo_cards')
    .select('*')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()

  if (!card) return NextResponse.json({ error: 'Bingo card not found' }, { status: 404 })

  const { data: calledRows } = await supabase.from('bingo_called_numbers').select('number').eq('game_id', code)
  const called = (calledRows ?? []).map((row) => row.number)
  const cells = card.cells as number[]
  const marked = (card.marked_indices as number[]) ?? []

  if (marked.includes(cellIndex)) {
    return NextResponse.json({ success: true, marked_indices: marked })
  }

  const number = cells[cellIndex]
  if (!canMarkCell(cells, cellIndex, number, called)) {
    return NextResponse.json({ error: 'That number has not been called yet' }, { status: 400 })
  }

  const nextMarked = [...marked, cellIndex]
  const { error } = await supabase.from('bingo_cards').update({ marked_indices: nextMarked }).eq('id', card.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, marked_indices: nextMarked })
}
