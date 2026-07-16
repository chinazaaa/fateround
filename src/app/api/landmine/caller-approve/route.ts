import { NextRequest, NextResponse } from 'next/server'
import { approveLandmineRound } from '@/lib/landmine-advance'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { parseLandmineMetadata, roundCallerPlayerId } from '@/lib/landmine'
import { landmineCallerApproveSchema } from '@/lib/validation'
import type { LandmineMetadata, Game, Round } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

// host_review phase: the round's caller (who picked the category) may overturn contested
// Valid/Void marks before the mine is revealed. Only active when the host-override setting is on.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineCallerApproveSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, overrides } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isLandmineGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Landmine game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'host_review') {
    return NextResponse.json({ error: 'Round is not awaiting review' }, { status: 400 })
  }

  const callerId = roundCallerPlayerId(round as Round, metadata)
  if (callerId !== auth.player.id) {
    return NextResponse.json({ error: 'Only the caller can review this round' }, { status: 403 })
  }

  const callerOverrides: NonNullable<LandmineMetadata['host_overrides']> = {}
  for (const row of overrides) callerOverrides[row.playerId] = row.valid

  const ok = await approveLandmineRound(supabase, game as Game, roundId, callerOverrides)
  if (!ok) return NextResponse.json({ error: 'Failed to approve round' }, { status: 500 })

  return NextResponse.json({ success: true })
}
