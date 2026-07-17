import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import {
  gameLandmineMineSource,
  landmineAnsweringPlayerIds,
  parseLandmineMetadata,
  roundCallerPlayerId,
} from '@/lib/landmine'
import { applyManualSetup } from '@/lib/landmine-advance'
import { landmineSetupSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import type { Game, Round } from '@/types'

// MANUAL mode: the rotating setter submits the category AND the mine word(s). The mine is stored
// secretly (landmine_round_mines) and never returned to the client; only the category goes public.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineSetupSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, category, mines } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isLandmineGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Landmine game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (gameLandmineMineSource(game as Game) !== 'manual') {
    return NextResponse.json({ error: 'This game is not in manual mode' }, { status: 400 })
  }

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'category_pick') {
    return NextResponse.json({ error: 'Not in setup phase' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const setterId = roundCallerPlayerId(round as Round, metadata)
  if (setterId !== auth.player.id) {
    return NextResponse.json({ error: 'Only the setter can set up this round' }, { status: 403 })
  }

  // The setter sits out, so seed blank answers only for the other active players.
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', code)
    .eq('spectator', false)
    .eq('is_eliminated', false)
  const activeIds = (players ?? []).map((p) => p.id)
  const answeringIds = landmineAnsweringPlayerIds(activeIds, setterId, true)

  const ok = await applyManualSetup(supabase, code, round as Round, category, mines, answeringIds)
  if (!ok) return NextResponse.json({ error: internalErrorMessage('landmine/setup', 'setup failed') }, { status: 500 })

  return NextResponse.json({ success: true })
}
