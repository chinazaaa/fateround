import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseSudokuMetadata, validateBlock, sudokuBlockPoints, SUDOKU_WRONG_PENALTY } from '@/lib/sudoku'
import { markGameFinished } from '@/lib/game-finish'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  playerId: z.string().uuid(),
  blockIndex: z.number().int().min(0).max(8),
  cells: z.array(z.array(z.number().int().min(1).max(9)).length(3)).length(3),
})

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = submitSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, blockIndex, cells } = parsed.data

  // Load game and verify it's active
  const { data: game } = await supabase.from('games').select('id,status').eq('id', gameId).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }

  // Load the active round
  const { data: round } = await supabase
    .from('rounds')
    .select('id,sudoku_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const metadata = parseSudokuMetadata(round.sudoku_metadata)
  if (!metadata) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  // Only block re-submission if the player already solved this block correctly
  const { data: alreadySolved } = await supabase
    .from('sudoku_submissions')
    .select('id')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .eq('block_index', blockIndex)
    .eq('is_correct', true)
    .maybeSingle()

  if (alreadySolved) {
    return NextResponse.json({ error: 'Already solved this block' }, { status: 409 })
  }

  const isCorrect = validateBlock(cells, metadata.solution, blockIndex)

  let pointsAwarded: number
  if (isCorrect) {
    // Count previous correct submissions for this block to determine position
    const { count } = await supabase
      .from('sudoku_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', round.id)
      .eq('block_index', blockIndex)
      .eq('is_correct', true)

    pointsAwarded = sudokuBlockPoints(count ?? 0)
  } else {
    pointsAwarded = SUDOKU_WRONG_PENALTY
  }

  const { error: insertError } = await supabase.from('sudoku_submissions').insert({
    game_id: gameId,
    round_id: round.id,
    player_id: playerId,
    block_index: blockIndex,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
  })

  if (insertError) {
    // Partial unique index on correct answers — concurrent correct submission
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already solved this block' }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Auto-finish once every block has been solved. The whole puzzle is complete when
  // all 9 block indices have at least one correct submission for this round.
  if (isCorrect) {
    const { data: correctSubs } = await supabase
      .from('sudoku_submissions')
      .select('block_index')
      .eq('round_id', round.id)
      .eq('is_correct', true)

    const solvedBlocks = new Set((correctSubs ?? []).map((s) => s.block_index))
    if (solvedBlocks.size >= 9) {
      await markGameFinished(supabase, gameId)
    }
  }

  return NextResponse.json({ success: true, isCorrect, pointsAwarded })
}
