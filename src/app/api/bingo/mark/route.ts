import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bingoMarkSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { canMarkCell } from '@/lib/bingo'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = bingoMarkSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, cellIndex } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

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
  const { error } = await supabase
    .from('bingo_cards')
    .update({ marked_indices: nextMarked })
    .eq('id', card.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, marked_indices: nextMarked })
}
