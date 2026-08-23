import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'

const trollRunSyncSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
})

/**
 * System/timer route for Troll Run — the tokenless sibling of `/api/troll-run/advance`.
 *
 * `advance` requires a host or player token (a light spam guard) which means the
 * always-on server ticker in `src/lib/game-tick.ts` cannot drive it, so a race whose
 * countdown or round deadline lapses while every participant has backgrounded their tab
 * would sit stalled. This route exists so the ticker has something to poke, mirroring
 * the `/api/bingo/sync` pattern.
 *
 * It NEVER takes `forceNextRound` — leaving the scoreboard is a real host decision, not a
 * deadline — so it can only apply transitions the clock has already earned. That is the
 * same safety property `advance` relies on, which is why dropping the token here costs
 * nothing: an unauthenticated poke can do no more than let time pass.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, trollRunSyncSchema)
  if (bodyError) return bodyError

  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id,status,game_type').eq('id', body.gameId).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.game_type !== 'troll_run') {
    return NextResponse.json({ error: 'Not a Troll Run game' }, { status: 400 })
  }
  // Not an error for a ticker: a game that finished between the poke being scheduled and
  // it landing is the normal case, and a 4xx would just be noise in the tick loop.
  if (game.status !== 'active') {
    return NextResponse.json({ ok: true, code: 'not_active' })
  }

  try {
    const result = await syncTrollRunGameState(supabase, body.gameId)
    if (result.code === 'session_not_found') {
      return NextResponse.json({ error: 'Race not found', code: result.code }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: internalErrorMessage('troll_run:sync', error) }, { status: 500 })
  }
}
