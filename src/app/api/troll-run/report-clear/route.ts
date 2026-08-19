import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertTrollRunRacingPlayer, trollRunElapsedMs } from '@/lib/troll-run'

const reportClearSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  levelId: z.string().min(1).max(80),
  levelName: z.string().min(1).max(80).optional(),
  timeMs: z.number().int().nonnegative(),
})

/**
 * Advances the caller past the level they just cleared.
 *
 * Progress is derived from the session's own level order, not from an index the client sends:
 * the level being reported must be the one the server believes the player is on, and the new
 * index is that position plus one. A duplicate report (retry, double callback) matches no
 * longer and is acknowledged as ignored instead of skipping a level. Elapsed race time comes
 * from the shared round clock so a tampered client cannot report an impossible split.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, reportClearSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, levelId, levelName, timeMs } = body
  const supabase = getSupabaseAdmin()

  const guard = await assertTrollRunRacingPlayer(supabase, gameId, resumeToken)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { session, state } = guard

  const expectedIndex = session.level_order.indexOf(levelId)
  if (expectedIndex === -1) {
    return NextResponse.json({ error: 'That level is not in this round' }, { status: 400 })
  }
  if (expectedIndex !== state.current_level_index) {
    return NextResponse.json({ ok: true, ignored: true, currentLevelIndex: state.current_level_index })
  }

  const nextIndex = expectedIndex + 1
  const elapsedMs = trollRunElapsedMs(session)

  // Compare-and-set on the index the decision was made against, so two reports for the same
  // level can only ever move the player forward once.
  const { data: claimed, error: updateError } = await supabase
    .from('troll_run_player_states')
    .update({
      current_level_index: nextIndex,
      levels_cleared: nextIndex,
      total_time_ms: elapsedMs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id)
    .eq('current_level_index', expectedIndex)
    .select('id')

  if (updateError) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:report-clear', updateError) }, { status: 500 })
  }

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, ignored: true, currentLevelIndex: nextIndex })
  }

  // The feed shows each level's own split, which only the client can measure — clamped to the
  // round limit so it stays plausible. Scores never read it.
  await supabase.from('troll_run_events').insert({
    game_id: gameId,
    player_id: state.player_id,
    round: session.current_round,
    level_id: levelId,
    level_name: levelName ?? levelId,
    event_type: 'clear',
    time_ms: Math.min(timeMs, session.round_time_limit * 1000),
  })

  return NextResponse.json({
    ok: true,
    currentLevelIndex: nextIndex,
    levelsCleared: nextIndex,
    allCleared: nextIndex >= session.level_order.length,
  })
}
