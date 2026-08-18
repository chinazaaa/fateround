import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'

const reportDeathSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  levelId: z.string().min(1),
  levelName: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const parsed = reportDeathSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { gameId, playerId, levelId, levelName } = parsed.data
    const supabase = getSupabaseAdmin()

    // Get current session round
    const { data: session } = await supabase
      .from('troll_run_sessions')
      .select('current_round, phase')
      .eq('game_id', gameId)
      .maybeSingle()

    if (!session || session.phase !== 'racing') {
      return NextResponse.json({ error: 'Session not in racing phase' }, { status: 400 })
    }

    // Insert death event
    await supabase.from('troll_run_events').insert({
      game_id: gameId,
      player_id: playerId,
      round: session.current_round,
      level_id: levelId,
      level_name: levelName || levelId,
      event_type: 'death',
    })

    // Increment player state deaths
    const { data: state } = await supabase
      .from('troll_run_player_states')
      .select('id, deaths')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
      .eq('current_round', session.current_round)
      .maybeSingle()

    if (state) {
      await supabase
        .from('troll_run_player_states')
        .update({
          deaths: (state.deaths || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
