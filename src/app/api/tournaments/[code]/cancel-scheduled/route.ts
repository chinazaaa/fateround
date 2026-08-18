import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyTournamentEvent } from '@/lib/tournament-push'

/**
 * Tournament follow-up — cancel a scheduled tournament before it starts.
 *
 * Sets status='finished' + result_reason='host_cancelled' so downstream
 * "hide finished" filters treat it identically to a normal end. Fires the
 * "cancelled" push to every registered subscription — single fan-out,
 * bypasses any quiet-hours gate (missing this ping would strand the
 * registered player).
 *
 * Only usable before the tournament starts (status='scheduled' | 'waiting').
 * After start the existing tournament-finish flow takes over.
 */

const schema = z.object({ hostToken: z.string().min(1) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
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
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament already finished.' }, { status: 400 })
  }
  if (tournament.status === 'active') {
    return NextResponse.json(
      { error: 'Cancel is only available before the tournament starts. Use End tournament for an active one.' },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('tournaments')
    .update({
      status: 'finished',
      finished_at: new Date().toISOString(),
      result_reason: 'host_cancelled',
    })
    .eq('id', tournamentId)
  if (error) return NextResponse.json({ error: internalErrorMessage('tournaments/cancel', error) }, { status: 500 })

  const title = tournament.title ? String(tournament.title) : 'The tournament'
  void notifyTournamentEvent(tournamentId, 'cancelled', {
    title: '❌ Tournament cancelled',
    body: `${title} was cancelled by the host.`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
