import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { processDescribeItExpireTurn } from '@/lib/describe-it'
import { describeItGameSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but processDescribeItExpireTurn
// only acts once the turn deadline has genuinely passed, so there's no
// per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const parsed = describeItGameSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const code = parsed.data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isDescribeItGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Text Charades game' }, { status: 400 })
  }

  const { error } = await processDescribeItExpireTurn(supabase, code)
  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ success: true })
}
