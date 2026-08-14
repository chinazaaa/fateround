import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyTournamentEvent } from '@/lib/tournament-push'

/**
 * Scheduled-tournament reminder dispatcher. Meant to be invoked by an external
 * scheduler every 1–2 min (Vercel Cron, GitHub Actions cron, external ping).
 * Auth: shared-secret header `Authorization: Bearer <CRON_SECRET>`. If
 * CRON_SECRET is unset in the env the route refuses every call, so an
 * unconfigured deploy can't accidentally leak the endpoint.
 *
 * What it does each run:
 *   1. Find tournaments where scheduled_at is within the T-15 window AND
 *      push_sent_t15_at is null. Fire "starts in 15 min" push, mark sent.
 *   2. Find tournaments where scheduled_at is within the T-0 window AND
 *      push_sent_t0_at is null. Fire "starting now" push, mark sent.
 *
 * "Window" is generous: (target-90s, target+180s) — wider than the smallest
 * plausible cron cadence, so a run that fires late still catches every
 * scheduled event. The push_sent_* mark prevents re-firing on the next run.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const now = Date.now()
  // Window bounds — the ± values below make cron cadences up to ~90 s reliable.
  // Wider on the "past" side so a delayed run still catches recent events.
  const win = (targetMs: number) => ({
    from: new Date(targetMs - 180_000).toISOString(),
    to: new Date(targetMs + 90_000).toISOString(),
  })

  const t15 = win(now + 15 * 60_000)
  const t0 = win(now)

  const [{ data: due15 }, { data: due0 }] = await Promise.all([
    admin
      .from('tournaments')
      .select('id, title, scheduled_at, push_sent_t15_at, status')
      .neq('status', 'finished')
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', t15.from)
      .lte('scheduled_at', t15.to)
      .is('push_sent_t15_at', null)
      .limit(500),
    admin
      .from('tournaments')
      .select('id, title, scheduled_at, push_sent_t0_at, status')
      .neq('status', 'finished')
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', t0.from)
      .lte('scheduled_at', t0.to)
      .is('push_sent_t0_at', null)
      .limit(500),
  ])

  const dispatched: Array<{ id: string; kind: 'starts_in_15' | 'starts_now' }> = []

  for (const t of due15 ?? []) {
    // Mark BEFORE sending so a slow send can't be double-fired by a second
    // cron run overlapping this one. The row is service-role only.
    await admin.from('tournaments').update({ push_sent_t15_at: new Date().toISOString() }).eq('id', t.id)
    await notifyTournamentEvent(t.id as string, 'starts_in_15', {
      body: `${t.title} kicks off in 15 minutes. Tap to open the lobby.`,
    })
    dispatched.push({ id: t.id as string, kind: 'starts_in_15' })
  }
  for (const t of due0 ?? []) {
    await admin.from('tournaments').update({ push_sent_t0_at: new Date().toISOString() }).eq('id', t.id)
    await notifyTournamentEvent(t.id as string, 'starts_now', {
      body: `${t.title} is starting now — tap to join.`,
    })
    dispatched.push({ id: t.id as string, kind: 'starts_now' })
  }

  return NextResponse.json({ ok: true, dispatched })
}

// Vercel Cron sends a GET by default; alias so operators can wire it up
// without a per-provider body change.
export const GET = POST
