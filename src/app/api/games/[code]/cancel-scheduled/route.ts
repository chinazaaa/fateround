import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertHostGameSettings } from '@/lib/game-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fireHostCancelledPush } from '@/lib/scheduled-games'

/**
 * Discovery Phase C — cancel a scheduled game before it opens.
 *
 * Only while status='scheduled'. Sets status='finished',
 * result_reason='host_cancelled'. Fan-out is a single "cancelled" push per
 * RSVPer (bypass quiet hours per plan — missing it strands the user).
 * After scheduled_at the existing per-game End-game flow handles endings.
 */

const schema = z.object({ hostToken: z.string().min(1) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const auth = await assertHostGameSettings(admin, gameCode, parsed.data.hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game!
  if (game.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled games can be cancelled from this endpoint.' }, { status: 400 })
  }

  const { error } = await admin
    .from('games')
    .update({ status: 'finished', finished_at: new Date().toISOString(), result_reason: 'host_cancelled' })
    .eq('id', gameCode)
  if (error) return NextResponse.json({ error: internalErrorMessage('cancel-scheduled', error) }, { status: 500 })

  void fireHostCancelledPush(gameCode, String(game.game_type)).catch(() => {})
  return NextResponse.json({ ok: true })
}
