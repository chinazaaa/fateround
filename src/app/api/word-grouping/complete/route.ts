import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isWordGroupingGame } from '@/lib/game-types'
import { settleWordGroupingGame } from '@/lib/word-grouping-completion'

const completeSchema = z.object({ gameId: z.string().min(1).max(10).toUpperCase() })

/**
 * Re-run the "is everyone done?" completion check for a Word Grouping game, with no guess involved.
 * The submit route finishes the game when the last player finishes, but if that finish failed after
 * the guess was committed nothing else would retry it (an untimed game would wait for the idle
 * reaper and end as `idle_timeout`). A client whose own puzzle is done calls this until the game
 * finishes. It can only finish a game whose whole roster really is done, and the finish is a
 * compare-and-swap, so any caller may trigger it.
 */
export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, completeSchema)
  if (bodyError) return bodyError
  const code = data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game, error: gameError } = await supabase.from('games').select('game_type').eq('id', code).maybeSingle()
  // A failed lookup is transient: answer 500 (the client keeps asking), never a permanent 404.
  if (gameError) {
    return NextResponse.json({ error: internalErrorMessage('word-grouping/complete', gameError) }, { status: 500 })
  }
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordGroupingGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Grouping game' }, { status: 400 })
  }

  const { finished, error } = await settleWordGroupingGame(supabase, code)
  if (error) {
    return NextResponse.json({ error: internalErrorMessage('word-grouping/complete', error) }, { status: 500 })
  }
  return NextResponse.json({ success: true, finished })
}
