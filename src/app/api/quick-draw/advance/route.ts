import { NextRequest, NextResponse } from 'next/server'
import { quickDrawAdvanceSchema } from '@/lib/validation'
import { syncQuickDrawGameState } from '@/lib/quick-draw-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { secretMatches } from '@/lib/secret-compare'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, quickDrawAdvanceSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // force skips the live phase for everyone, so it must be DERIVED from a verified host
  // token — never taken from the client. A bad/absent token yields force=false, which
  // leaves the anonymous, deadline-driven advance path working as intended.
  //
  // The lookup is guarded on `hostToken` being present: every client polls this route on the
  // deadline and almost none of them send a token, so querying first would add a DB read to
  // every poll of every game (flagged in review on PR #738). Comparison is constant-time for
  // the same reason the rest of the app's token checks are.
  let force = false
  if (hostToken) {
    const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
    force = await secretMatches(hostToken, game?.host_token)
  }

  const result = await syncQuickDrawGameState(supabase, code, { force })
  return NextResponse.json(result)
}
