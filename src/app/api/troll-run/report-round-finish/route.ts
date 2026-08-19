import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertTrollRunRacingPlayer, trollRunElapsedMs } from '@/lib/troll-run'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'

const reportFinishSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
})

/**
 * Marks the caller as done with the round.
 *
 * Nothing about the result is taken from the request: the server only accepts the claim if its
 * own progress row shows every level cleared, and the finishing time is read off the shared
 * round clock. Placement and score are deliberately not written here — the whole round is
 * scored in one pass when it ends, so ranking follows elapsed race time instead of whichever
 * request happened to arrive first.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, reportFinishSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const supabase = getSupabaseAdmin()

  const guard = await assertTrollRunRacingPlayer(supabase, gameId, resumeToken)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { session, state } = guard

  if (state.current_level_index < session.level_order.length) {
    return NextResponse.json({ error: 'You still have levels left to clear' }, { status: 400 })
  }

  const { data: claimed, error: updateError } = await supabase
    .from('troll_run_player_states')
    .update({
      round_finished: true,
      total_time_ms: trollRunElapsedMs(session),
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id)
    .eq('round_finished', false)
    .select('id')

  if (updateError) {
    return NextResponse.json(
      { error: internalErrorMessage('troll_run:report-round-finish', updateError) },
      { status: 500 }
    )
  }

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, alreadyFinished: true })
  }

  // The round ends as soon as the last runner is home, without waiting out the clock.
  const advance = await syncTrollRunGameState(supabase, gameId)

  return NextResponse.json({ ok: true, phase: advance.phase })
}
