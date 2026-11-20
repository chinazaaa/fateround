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

  // Event insert, total and the "runner still unfinished / round still racing" checks happen in
  // one database transaction under row locks, so scoring sees either an accepted death or none
  // and there is no withdraw step that could fail and leave an event behind.
  const { data: result, error: rpcError } = await supabase.rpc('troll_run_report_death', {
    p_game_id: gameId,
    p_player_id: state.player_id,
    p_round: session.current_round,
    p_level_id: levelId,
    p_level_name: levelName ?? levelId,
  })

  if (rpcError) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:report-death', rpcError) }, { status: 500 })
  }

  const outcome = (result ?? {}) as { status?: string; reason?: string; deaths?: number }
  if (outcome.status === 'ok' && typeof outcome.deaths === 'number') {
    return NextResponse.json({ ok: true, deaths: outcome.deaths })
  }
  if (outcome.status === 'ignored') {
    return NextResponse.json({ ok: true, ignored: true, deaths: outcome.deaths ?? state.deaths })
  }
  if (outcome.status === 'session_not_found' || outcome.status === 'state_not_found') {
    return NextResponse.json({ error: 'The round is not running' }, { status: 400 })
  }
  return NextResponse.json({ error: 'Could not record that death' }, { status: 500 })
}
