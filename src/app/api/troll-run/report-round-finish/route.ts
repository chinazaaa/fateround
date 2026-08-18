import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { calculateTrollRunScore } from '@/lib/troll-run'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'
import { z } from 'zod'

const reportFinishSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  totalTimeMs: z.number().int().nonnegative(),
  totalDeaths: z.number().int().nonnegative(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const parsed = reportFinishSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { gameId, playerId, totalTimeMs, totalDeaths } = parsed.data
    const supabase = getSupabaseAdmin()

    // Get current session
    const { data: session } = await supabase
      .from('troll_run_sessions')
      .select('current_round, phase, levels_per_round')
      .eq('game_id', gameId)
      .maybeSingle()

    if (!session || session.phase !== 'racing') {
      return NextResponse.json({ error: 'Session not in racing phase' }, { status: 400 })
    }

    // Get existing finishers to determine placement
    const { data: existingFinishers } = await supabase
      .from('troll_run_player_states')
      .select('id, finish_position')
      .eq('game_id', gameId)
      .eq('current_round', session.current_round)
      .eq('round_finished', true)
      .not('finish_position', 'is', null)

    const finishCount = existingFinishers?.length ?? 0
    const placement = finishCount + 1

    // Calculate score
    const roundScore = calculateTrollRunScore(placement, session.levels_per_round || 10, totalDeaths, totalTimeMs)

    // Fetch existing player state
    const { data: state } = await supabase
      .from('troll_run_player_states')
      .select('id, total_score')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
      .eq('current_round', session.current_round)
      .maybeSingle()

    if (state) {
      await supabase
        .from('troll_run_player_states')
        .update({
          round_finished: true,
          finish_position: placement,
          round_score: roundScore,
          total_score: (state.total_score || 0) + roundScore,
          deaths: totalDeaths,
          total_time_ms: totalTimeMs,
          levels_cleared: session.levels_per_round || 10,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.id)
    }

    // Trigger state advance check in case everyone is finished now
    await syncTrollRunGameState(supabase, gameId)

    return NextResponse.json({ ok: true, placement, roundScore })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
