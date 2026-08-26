import { NextRequest, NextResponse } from 'next/server'
import { isRummyGame, parseGameType } from '@/lib/game-types'
import { processRummyExpireTurn } from '@/lib/rummy'
import { rummyExpireTurnSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

// System / timer route: any client may poke it, but it only acts once the turn deadline
// has genuinely passed (enforced in processRummyExpireTurn using the server clock), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, rummyExpireTurnSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ ok: true, skipped: true })
  if (!isRummyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Rummy game' }, { status: 400 })
  }

  const result = await processRummyExpireTurn(supabase, code)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, skipped: result.skipped ?? false })
}
