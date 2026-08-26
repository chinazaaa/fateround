import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isGoFishGame } from '@/lib/game-types'
import { processGoFishExpireTurn } from '@/lib/gofish-server'
import { gofishActionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const schema = gofishActionSchema.pick({ gameId: true })

/**
 * System/timer route: any client may poke it, but it only acts once the turn
 * deadline has genuinely passed (enforced in processGoFishExpireTurn), so there's
 * no per-player token to authorize. Writes go through the service role.
 *
 * Mirrors /api/whot/expire-turn — same posture, same idempotence.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ ok: true, skipped: true })
  if (!isGoFishGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Go Fish game' }, { status: 400 })
  }

  const result = await processGoFishExpireTurn(supabase, code)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ ok: true, skipped: result.skipped ?? false })
}
