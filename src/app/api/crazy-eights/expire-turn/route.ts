import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isCrazyEightsGame } from '@/lib/game-types'
import { processCrazyEightsExpireTurn } from '@/lib/crazy-eights'
import { crazyEightsActionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const schema = crazyEightsActionSchema.pick({ gameId: true })

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced in processCrazyEightsExpireTurn), so
// there's no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ ok: true, skipped: true })
  if (!isCrazyEightsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Crazy Eights game' }, { status: 400 })
  }

  const result = await processCrazyEightsExpireTurn(supabase, code)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ ok: true, skipped: result.skipped ?? false })
}
