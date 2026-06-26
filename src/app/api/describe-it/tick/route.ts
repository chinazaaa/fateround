import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processDescribeItExpireTurn, processDescribeItAdvance } from '@/lib/describe-it'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

// Safety net so a match never freezes if every client disconnects. Meant to be
// polled by an external scheduler (e.g. an uptime cron or GitHub Actions); it
// only acts on sessions already past their deadline (the engine functions
// re-check phase + deadline, so this is idempotent). Protect it by setting
// CRON_SECRET and sending it as an `Authorization: Bearer <secret>` header.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()
  const [{ data: staleTurns }, { data: staleBreaks }] = await Promise.all([
    supabase
      .from('describe_it_sessions')
      .select('game_id')
      .eq('status', 'active')
      .eq('phase', 'turn')
      .lt('turn_deadline_at', nowIso),
    supabase
      .from('describe_it_sessions')
      .select('game_id')
      .eq('status', 'active')
      .eq('phase', 'break')
      .lt('break_deadline_at', nowIso),
  ])

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
