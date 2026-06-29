import { NextRequest, NextResponse } from 'next/server'
import { triviaAdvanceSchema } from '@/lib/validation'
import { syncTriviaGameState } from '@/lib/trivia-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, triviaAdvanceSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const force = body.force === true
  const supabase = getSupabaseAdmin()

  if (force) {
    if (!body.hostToken) {
      return NextResponse.json({ error: 'Host token required to force advance' }, { status: 403 })
    }
    const { data: game } = await supabase.from('games').select('host_token').eq('id', code).maybeSingle()
    if (!game || game.host_token !== body.hostToken) {
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
