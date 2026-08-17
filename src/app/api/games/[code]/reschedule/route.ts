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

  // Atomic guard applies to both branches: constrain the update on
  // status='scheduled' + host_token so a concurrent cancel / transfer /
  // T-0 flip between the auth read and this write can't be raced.
  if (!isNowOrPast) {
    const update = {
      scheduled_at: parsed.data.scheduled_at,
      last_activity_at: new Date().toISOString(),
    }
    const { data: updated, error } = await admin
      .from('games')
      .update(update)
      .eq('id', gameCode)
      .eq('status', 'scheduled')
      .eq('host_token', parsed.data.hostToken)
      .select('id')
    if (error) return NextResponse.json({ error: internalErrorMessage('reschedule', error) }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'This scheduled game just changed — refresh and try again.' }, { status: 409 })
    }
    void fireHostRescheduledPush(gameCode, String(game.game_type), parsed.data.scheduled_at).catch(() => {})
    return NextResponse.json({ ok: true, opened: false })
  }

  // Now: flip status to waiting inline (skip the T-0 tick) + fire the
  // rescheduled push with the new instant. The T-15 heads-up is skipped —
  // the window compressed past it.
  const nowIso = new Date().toISOString()
  const { data: updatedNow, error } = await admin
    .from('games')
    .update({ status: 'waiting', scheduled_at: nowIso, opened_at: nowIso, last_activity_at: nowIso })
    .eq('id', gameCode)
    .eq('status', 'scheduled')
    .eq('host_token', parsed.data.hostToken)
    .select('id')
  if (error) return NextResponse.json({ error: internalErrorMessage('reschedule', error) }, { status: 500 })
  if (!updatedNow || updatedNow.length === 0) {
    return NextResponse.json({ error: 'This scheduled game just changed — refresh and try again.' }, { status: 409 })
  }
  void fireHostRescheduledPush(gameCode, String(game.game_type), nowIso).catch(() => {})
  return NextResponse.json({ ok: true, opened: true })
}
