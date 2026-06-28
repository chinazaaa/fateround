import { NextRequest, NextResponse } from 'next/server'
import { ttlAdvanceSchema } from '@/lib/validation'
import { syncTwoTruthsGameState } from '@/lib/two-truths-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = ttlAdvanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, force } = parsed.data
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
