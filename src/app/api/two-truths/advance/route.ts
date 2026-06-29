import { NextRequest, NextResponse } from 'next/server'
import { ttlAdvanceSchema } from '@/lib/validation'
import { syncTwoTruthsGameState } from '@/lib/two-truths-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, ttlAdvanceSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, force } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  if (hostToken) {
    const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const result = await syncTwoTruthsGameState(supabase, code, { force })
  return NextResponse.json(result)
}
