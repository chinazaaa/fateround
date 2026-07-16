import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { parseLandmineMetadata, roundCallerPlayerId } from '@/lib/landmine'
import { applyCategoryPick } from '@/lib/landmine-advance'
import { landmineCategorySchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import type { Round } from '@/types'

// The rotating caller picks the category for the round. The mine is drawn server-side and
// stored secretly; the client only learns the category, never the mine.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineCategorySchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, categoryId } = body
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

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'category_pick') {
    return NextResponse.json({ error: 'Not in category pick phase' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const callerId = roundCallerPlayerId(round as Round, metadata)
  if (callerId !== auth.player.id) {
    return NextResponse.json({ error: 'Only the caller can pick the category' }, { status: 403 })
  }

  const { data: category } = await supabase
    .from('landmine_categories')
    .select('id, name, entries')
    .eq('id', categoryId)
    .eq('is_active', true)
    .maybeSingle()
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  // Count non-spectator, non-eliminated players so blank answers are seeded for the round.
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', code)
    .eq('spectator', false)
    .eq('is_eliminated', false)
  const playerIds = (players ?? []).map((p) => p.id)

  const ok = await applyCategoryPick(supabase, code, round as Round, category, playerIds)
  if (!ok)
    return NextResponse.json({ error: internalErrorMessage('landmine/category', 'pick failed') }, { status: 500 })

  return NextResponse.json({ success: true })
}
