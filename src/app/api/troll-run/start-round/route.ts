import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { TROLL_RUN_COUNTDOWN_SECONDS } from '@/lib/troll-run'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
import { z } from 'zod'

const startRoundSchema = z.object({
  gameId: z.string().min(1),
  hostToken: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const parsed = startRoundSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { gameId, hostToken } = parsed.data
    const supabase = getSupabaseAdmin()

    // Verify host
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, host_token, troll_run_world, troll_run_time_limit')
      .eq('id', gameId)
      .maybeSingle()

    if (gameError || !game || game.host_token !== hostToken) {
      return NextResponse.json({ error: 'Unauthorized host token' }, { status: 403 })
    }

    // Set session phase to countdown
    const deadline = new Date(Date.now() + TROLL_RUN_COUNTDOWN_SECONDS * 1000).toISOString()
    const levelOrder = WORLD_1_LEVELS.map((lvl) => lvl.id)

    const { error: sessionError } = await supabase
      .from('troll_run_sessions')
      .update({
        phase: 'countdown',
        turn_deadline_at: deadline,
        level_order: levelOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)

    if (sessionError) {
      return NextResponse.json({ error: 'Failed to start countdown' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, phase: 'countdown' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
