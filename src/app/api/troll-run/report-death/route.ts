import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertTrollRunRacingPlayer } from '@/lib/troll-run-guard'

const reportDeathSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  levelId: z.string().min(1).max(80),
  levelName: z.string().min(1).max(80).optional(),
  /** Round the client raised the death in; a death queued across a round change must not count. */
  round: z.number().int().positive().optional(),
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

  const { gameId, resumeToken, levelId, levelName, round } = body
  const supabase = getSupabaseAdmin()

  const guard = await assertTrollRunRacingPlayer(supabase, gameId, resumeToken)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { session, state } = guard

  // A report that sat in the client's queue past a round change belongs to a round that is over.
  if (round !== undefined && round !== session.current_round) {
    return NextResponse.json({ ok: true, ignored: true, stale: true, deaths: state.deaths })
  }
  if (!session.level_order.includes(levelId)) {
    return NextResponse.json({ error: 'That level is not in this round' }, { status: 400 })
  }
  // Finished runners can no longer die: acknowledge as ignored (report-clear's convention).
  if (state.current_level_index >= session.level_order.length) {
    return NextResponse.json({ ok: true, ignored: true, deaths: state.deaths })
  }

  const { data: inserted, error: eventError } = await supabase
    .from('troll_run_events')
    .insert({
      game_id: gameId,
      player_id: state.player_id,
      round: session.current_round,
      level_id: levelId,
      level_name: levelName ?? levelId,
      event_type: 'death',
    })
    .select('id')
    .single()

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

  // The runner may have cleared the final level between the guard's read and this write. The
  // total is therefore only written while the runner is still unfinished (the same write that
  // would otherwise match on the row id alone); if it no longer matches, the death arrived after
  // the finish, so its event is withdrawn and the report is acknowledged as ignored.
  const { data: updated, error: updateError } = await supabase
    .from('troll_run_player_states')
    .update({ deaths, updated_at: new Date().toISOString() })
    .eq('id', state.id)
    .lt('current_level_index', session.level_order.length)
    .select('id')

  if (updateError) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:report-death', updateError) }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    if (inserted?.id) await supabase.from('troll_run_events').delete().eq('id', inserted.id)
    return NextResponse.json({ ok: true, ignored: true, deaths: state.deaths })
  }

  return NextResponse.json({ ok: true, deaths })
}
