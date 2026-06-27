import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { markGameFinished } from '@/lib/game-finish'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  playerId: z.string().uuid(),
  blockIndex: z.number().int().min(0).max(8),
  cells: z.array(z.array(z.number().int().min(1).max(9)).length(3)).length(3),
})

// Map the RPC's RAISE EXCEPTION messages to HTTP responses.
const ERROR_STATUS: Record<string, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Game not found' },
  ROUND_NOT_FOUND: { status: 404, message: 'Round not found' },
  GAME_NOT_ACTIVE: { status: 400, message: 'Game is not active' },
  ALREADY_SOLVED: { status: 409, message: 'Already solved this block' },
  SOLUTION_MISSING: { status: 500, message: 'Puzzle data missing' },
  INVALID_BLOCK: { status: 400, message: 'Invalid block' },
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = submitSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, blockIndex, cells } = parsed.data

  // Validation, scoring, and recording all happen inside a SECURITY DEFINER function
  // so the solution never has to be sent to (or readable by) any client.
  const { data, error } = await supabase.rpc('sudoku_submit_block', {
    p_game_id: gameId,
    p_player_id: playerId,
    p_block_index: blockIndex,
    p_cells: cells,
  })

  if (error) {
    const known = Object.entries(ERROR_STATUS).find(([key]) => error.message.includes(key))
    if (known) return NextResponse.json({ error: known[1].message }, { status: known[1].status })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = data as { is_correct: boolean; points_awarded: number; all_solved: boolean }

  // Auto-finish once every block is solved.
  if (result.all_solved) {
    await markGameFinished(supabase, gameId)
  }

  return NextResponse.json({ success: true, isCorrect: result.is_correct, pointsAwarded: result.points_awarded })
}
