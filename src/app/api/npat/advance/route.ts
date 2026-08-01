import { NextRequest, NextResponse } from 'next/server'
import { syncNpatGameState } from '@/lib/npat-advance'
import { npatAdvanceSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { secretMatches } from '@/lib/secret-compare'

// System/timer route: any client may poke it and syncNpatGameState only acts once a
// phase deadline has genuinely passed — that anonymous, deadline-driven advance stays
// open. But `force` skips the live phase for everyone, so it must be authorized by the
// host: force is only honored when a valid host_token is presented (same idiom as
// trivia/advance). Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatAdvanceSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const force = body.force === true
  if (force) {
    if (!body.hostToken) {
      return NextResponse.json({ error: 'Host token required to force advance' }, { status: 403 })
    }
    const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
    if (!(await secretMatches(body.hostToken, game?.host_token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const result = await syncNpatGameState(supabase, code, { force })
  return NextResponse.json(result)
}
