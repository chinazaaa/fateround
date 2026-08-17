import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertHostScheduledGame } from '@/lib/game-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fireHostRescheduledPush } from '@/lib/scheduled-games'

/**
 * Discovery Phase C — reschedule a scheduled game.
 *
 * Only available while status='scheduled'. Fires the reschedule push to
 * every RSVPer (single fan-out, bypass quiet hours) and clears
 * game_rsvps.reminder_sent_at so the new T-15 tick fires against the new
 * anchor time. The special "Now" preset (scheduled_at set to <= now) also
 * inline-transitions to waiting so RSVPers don't wait a tick for the lobby.
 */

const schema = z.object({
  hostToken: z.string().min(1),
  scheduled_at: z.string().datetime(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const auth = await assertHostScheduledGame(admin, gameCode, parsed.data.hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game!
  if (game.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled games can be rescheduled.' }, { status: 400 })
  }

  const nextTs = new Date(parsed.data.scheduled_at)
  const isNowOrPast = nextTs.getTime() <= Date.now()

  // "Now" preset compresses to inline transition. Anything else has to be
  // strictly in the future — the past would auto-open on the next tick and
  // confuse RSVPers.
  if (!isNowOrPast) {
    const update = {
      scheduled_at: parsed.data.scheduled_at,
      last_activity_at: new Date().toISOString(),
    }
    const { error } = await admin.from('games').update(update).eq('id', gameCode)
    if (error) return NextResponse.json({ error: internalErrorMessage('reschedule', error) }, { status: 500 })
    void fireHostRescheduledPush(gameCode, String(game.game_type), parsed.data.scheduled_at).catch(() => {})
    return NextResponse.json({ ok: true, opened: false })
  }

  // Now: flip status to waiting inline (skip the T-0 tick) + fire the
  // rescheduled push with the new instant. The T-15 heads-up is skipped —
  // the window compressed past it.
  const nowIso = new Date().toISOString()
  const { error } = await admin
    .from('games')
    .update({ status: 'waiting', scheduled_at: nowIso, opened_at: nowIso, last_activity_at: nowIso })
    .eq('id', gameCode)
  if (error) return NextResponse.json({ error: internalErrorMessage('reschedule', error) }, { status: 500 })
  void fireHostRescheduledPush(gameCode, String(game.game_type), nowIso).catch(() => {})
  return NextResponse.json({ ok: true, opened: true })
}
