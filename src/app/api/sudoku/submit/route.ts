import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { markGameFinished } from '@/lib/game-finish'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
  value: z.number().int().min(1).max(9),
})

const ERROR_STATUS: Record<string, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Game not found' },
  ROUND_NOT_FOUND: { status: 404, message: 'Round not found' },
  GAME_NOT_ACTIVE: { status: 400, message: 'Game is not active' },
  ALREADY_SOLVED: { status: 409, message: 'You already solved this cell' },
  CELL_IS_GIVEN: { status: 400, message: 'This cell is pre-filled' },
  SOLUTION_MISSING: { status: 500, message: 'Puzzle data missing' },
  INVALID_CELL: { status: 400, message: 'Invalid cell' },
  INVALID_VALUE: { status: 400, message: 'Invalid value' },
}

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, row, col, value } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await supabase.rpc('sudoku_submit_cell', {
    p_game_id: code,
    p_player_id: auth.player.id,
    p_row: row,
    p_col: col,
    p_value: value,
  })

  if (error) {
    const known = Object.entries(ERROR_STATUS).find(([key]) => error.message.includes(key))
    if (known) return NextResponse.json({ error: known[1].message }, { status: known[1].status })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = data as { is_correct: boolean; points_awarded: number; all_solved: boolean }

  if (result.all_solved) {
    await markGameFinished(supabase, code)
  }

  return NextResponse.json({ success: true, isCorrect: result.is_correct, pointsAwarded: result.points_awarded })
}
