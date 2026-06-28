import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMonopolyGame } from '@/lib/game-types'
import { extendMonopolyGameDuration, clampMonopolyTimeExtension } from '@/lib/monopoly'
import { monopolyExtendTimeSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = monopolyExtendTimeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, extensionSeconds } = parsed.data
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, host_token, game_type, status')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isMonopolyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Monopoly game' }, { status: 400 })
  }

  const { error, newDurationSeconds } = await extendMonopolyGameDuration(
    supabase,
    gameId,
    clampMonopolyTimeExtension(extensionSeconds)
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true, game_duration_seconds: newDurationSeconds })
}
