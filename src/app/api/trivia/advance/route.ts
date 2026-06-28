import { NextRequest, NextResponse } from 'next/server'
import { triviaAdvanceSchema } from '@/lib/validation'
import { syncTriviaGameState } from '@/lib/trivia-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = triviaAdvanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const force = parsed.data.force === true
  const supabase = getSupabaseAdmin()

  if (force) {
    if (!parsed.data.hostToken) {
      return NextResponse.json({ error: 'Host token required to force advance' }, { status: 403 })
    }
    const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
    if (!game || game.host_token !== parsed.data.hostToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const result = await syncTriviaGameState(supabase, code, { force })

  if (result.code === 'game_not_found') {
    return NextResponse.json({ error: 'Game not found', code: result.code }, { status: 404 })
  }
  if (result.code === 'not_trivia') {
    return NextResponse.json({ error: 'Not a trivia game', code: result.code }, { status: 400 })
  }

  const idleCodes = new Set(['already_done', 'reveal_pending', 'round_active'])
  const status = result.ok || idleCodes.has(result.code) ? 200 : 409
  return NextResponse.json(result, { status })
}
