import { NextRequest, NextResponse } from 'next/server'
import { tickScheduledGamePushes } from '@/lib/scheduled-games'

/**
 * Discovery Phase C — scheduled-game push tick.
 *
 * pg_cron POSTs this endpoint every minute via pg_net (see the migration
 * 20261005120000_scheduled_games_and_rsvps.sql). The pure-SQL work (opening
 * due games, dropping stale unconfirmed RSVPs) already ran in-database before
 * this call arrives; this endpoint's only job is to send pushes via the
 * existing Expo + web-push senders.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`. The same secret Phase A cron
 * routes use — one secret guards every scheduled entrypoint on the server.
 */

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await tickScheduledGamePushes()
  return NextResponse.json(result)
}
