import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processDescribeItExpireTurn, processDescribeItAdvance } from '@/lib/describe-it'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

// Cap how many stale sessions a single tick advances, so a backlog can't run the
// serverless function past its time limit (the next tick picks up the rest).
const MAX_SESSIONS_PER_TICK = 50

// Safety net so a match never freezes if every client disconnects. Meant to be
// POSTed by an external scheduler (e.g. an uptime cron or GitHub Actions); it
// only acts on sessions already past their deadline (the engine functions
// re-check phase + deadline, so this is idempotent). Requires CRON_SECRET to be
// set and sent as an `Authorization: Bearer <secret>` header.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Default-deny: refuse to run a state-mutating endpoint unless a secret is
  // configured. Without this guard an unset CRON_SECRET would leave it open.
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()
  const [{ data: staleTurns, error: turnsError }, { data: staleBreaks, error: breaksError }] = await Promise.all([
    supabase
      .from('describe_it_sessions')
      .select('game_id')
      .eq('status', 'active')
      .eq('phase', 'turn')
      .lt('turn_deadline_at', nowIso)
      .limit(MAX_SESSIONS_PER_TICK),
    supabase
      .from('describe_it_sessions')
      .select('game_id')
      .eq('status', 'active')
      .eq('phase', 'break')
      .lt('break_deadline_at', nowIso)
      .limit(MAX_SESSIONS_PER_TICK),
  ])
  if (turnsError || breaksError) {
    console.error('describe-it tick: query failed', turnsError ?? breaksError)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  let advanced = 0
  for (const s of staleTurns ?? []) {
    await processDescribeItExpireTurn(supabase, s.game_id as string)
    advanced += 1
  }
  for (const s of staleBreaks ?? []) {
    await processDescribeItAdvance(supabase, s.game_id as string)
    advanced += 1
  }

  return NextResponse.json({ ok: true, advanced })
}
