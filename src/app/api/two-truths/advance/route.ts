import { NextRequest, NextResponse } from 'next/server'
import { ttlAdvanceSchema } from '@/lib/validation'
import { syncTwoTruthsGameState } from '@/lib/two-truths-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, ttlAdvanceSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // force skips the live phase for everyone, so it must be DERIVED from a verified host
  // token — never taken from the client. A bad/absent token yields force=false, which
  // leaves the anonymous, deadline-driven advance path working as intended.
  const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
  const force = !!hostToken && hostToken === game?.host_token

  const result = await syncTwoTruthsGameState(supabase, code, { force })
  return NextResponse.json(result)
}
