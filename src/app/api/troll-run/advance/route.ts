import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertPlayer } from '@/lib/game-admin'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'

const advanceSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  hostToken: z.string().min(4).optional(),
  resumeToken: z.string().min(4).optional(),
  forceNextRound: z.boolean().optional(),
})

/**
 * Drives the phase machine forward when a deadline has passed.
 *
 * Every client in the room polls this so the round still ends if the host's tab is asleep,
 * which is why a plain nudge is open to any player in the game as well as the host — it can
 * only apply transitions the clock already earned. Leaving the scoreboard for the next round
 * is a real decision rather than a deadline, so `forceNextRound` is host-only.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, advanceSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, resumeToken, forceNextRound } = body
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id,status,game_type,host_token')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.game_type !== 'troll_run') {
    return NextResponse.json({ error: 'Not a Troll Run game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }

  const isHost = Boolean(hostToken) && hostToken === game.host_token

  if (forceNextRound) {
    if (!isHost) return NextResponse.json({ error: 'Only the host can start the next round' }, { status: 403 })
  } else if (!isHost) {
    const auth = await assertPlayer(supabase, gameId, resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const result = await syncTrollRunGameState(supabase, gameId, { forceNextRound })
    if (!result.ok) return NextResponse.json({ error: 'Race not found' }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:advance', error) }, { status: 500 })
  }
}
