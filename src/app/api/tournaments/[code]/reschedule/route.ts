import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyTournamentEvent } from '@/lib/tournament-push'

/**
 * Tournament follow-up — reschedule a scheduled tournament.
 *
 * Mirror of /api/games/[code]/reschedule. Only meaningful while the
 * tournament hasn't started (status='scheduled' | 'waiting'). Sets the new
 * `scheduled_at` and fires a single "rescheduled" push to every registered
 * push subscription (bypass any quiet-hours gate per plan — missing the
 * update strands the player).
 *
 * The T-15 / T-0 dispatch bookkeeping columns (push_sent_t15_at /
 * push_sent_t0_at) are reset so the scheduled-reminder cron re-fires them
 * against the new anchor time.
 */

const schema = z.object({
  hostToken: z.string().min(1),
  scheduled_at: z.string().datetime(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, title, host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== parsed.data.hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished' || tournament.status === 'active') {
    return NextResponse.json({ error: 'Reschedule is only available before the tournament starts.' }, { status: 400 })
  }

  const nextTs = new Date(parsed.data.scheduled_at)
  if (nextTs.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 })
  }

  const { error } = await admin
    .from('tournaments')
    .update({
      scheduled_at: parsed.data.scheduled_at,
      // Reset the reminder bookkeeping so the T-15 / T-0 cron re-fires
      // against the new anchor. Same shape as game_rsvps.reminder_sent_at.
      push_sent_t15_at: null,
      push_sent_t0_at: null,
    })
    .eq('id', tournamentId)
  if (error) return NextResponse.json({ error: internalErrorMessage('tournaments/reschedule', error) }, { status: 500 })

  const when = nextTs.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const title = tournament.title ? String(tournament.title) : 'your tournament'
  void notifyTournamentEvent(tournamentId, 'rescheduled', {
    title: '📆 Tournament rescheduled',
    body: `${title} moved to ${when}.`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
