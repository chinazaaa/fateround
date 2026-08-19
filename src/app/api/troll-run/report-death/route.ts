import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertTrollRunRacingPlayer } from '@/lib/troll-run'

const reportDeathSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  levelId: z.string().min(1).max(80),
  levelName: z.string().min(1).max(80).optional(),
})

/**
 * Records one death for the calling player.
 *
 * The death count is re-derived from the event log rather than incremented from the row that
 * was just read: a runner can die twice within a few hundred milliseconds, and two
 * read-then-write increments racing each other would drop one of them (and with it the
 * score penalty).
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, reportDeathSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, levelId, levelName } = body
  const supabase = getSupabaseAdmin()

  const guard = await assertTrollRunRacingPlayer(supabase, gameId, resumeToken)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { session, state } = guard

  const { error: eventError } = await supabase.from('troll_run_events').insert({
    game_id: gameId,
    player_id: state.player_id,
    round: session.current_round,
    level_id: levelId,
    level_name: levelName ?? levelId,
    event_type: 'death',
  })

  if (eventError) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:report-death', eventError) }, { status: 500 })
  }

  const { count } = await supabase
    .from('troll_run_events')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('player_id', state.player_id)
    .eq('round', session.current_round)
    .eq('event_type', 'death')

  const deaths = count ?? state.deaths + 1

  const { error: updateError } = await supabase
    .from('troll_run_player_states')
    .update({ deaths, updated_at: new Date().toISOString() })
    .eq('id', state.id)

  if (updateError) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:report-death', updateError) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deaths })
}
