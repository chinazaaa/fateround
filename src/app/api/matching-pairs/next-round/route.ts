import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHost } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import {
  buildMatchingPairsRoundMetadata,
  buildMatchingPairsRoundRow,
  type MatchingPairsGridSize,
} from '@/lib/memory-match'
import { GAME_SELECT } from '@/lib/supabase-selects'

const schema = z.object({
  hostToken: z.string().min(4),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  // Verify host.
  const host = await assertHost(supabase, gameId, body.hostToken)
  if (host.error) return NextResponse.json({ error: host.error }, { status: host.status })

  // Load game to get round config and player list.
  const { data: game } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const nextRoundNumber = (game.current_round_number ?? 1) + 1
  if (nextRoundNumber > (game.rounds_count ?? 1)) {
    return NextResponse.json({ error: 'No more rounds' }, { status: 400 })
  }

  // Check the previous round is already finished (the flip route should have ended it).
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()
  if (activeRound) {
    return NextResponse.json({ error: 'Current round must be finished before starting the next one' }, { status: 400 })
  }

  // Load non-spectator players.
  const { data: playersData } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('spectator', false)
  const playerIds = ((playersData ?? []) as { id: string }[]).map((p) => p.id)

  // Resolve grid size.
  const gridSizePairs: MatchingPairsGridSize = game.game_duration_seconds === 16 ? 16 : 8

  // Generate fresh metadata for the new round.
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ (nextRoundNumber * 0x10000)
  const metadata = buildMatchingPairsRoundMetadata(gameId, seed, gridSizePairs, playerIds)
  const roundRow = buildMatchingPairsRoundRow(gameId, metadata, nextRoundNumber)

  const { data: insertedRound, error: roundError } = await supabase
    .from('rounds')
    .insert(roundRow)
    .select('id')
    .single()
  if (roundError || !insertedRound) {
    return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
  }

  // Create fresh progress rows for all players in the new round.
  const progressRows = playerIds.map((playerId: string) => ({
    game_id: gameId,
    round_id: insertedRound.id,
    player_id: playerId,
    pairs_matched: 0,
    wrong_attempts: 0,
    finished: false,
  }))
  const { error: progressError } = await supabase.from('memory_match_progress').insert(progressRows)
  if (progressError) {
    return NextResponse.json({ error: internalErrorMessage('matching-pairs/next-round', progressError) }, { status: 500 })
  }

  // Update the game pointer.
  const { error: pointerError } = await supabase
    .from('games')
    .update({ current_round_number: nextRoundNumber })
    .eq('id', gameId)
  if (pointerError) {
    return NextResponse.json({ error: internalErrorMessage('matching-pairs/next-round', pointerError) }, { status: 500 })
  }

  return NextResponse.json({ success: true, roundNumber: nextRoundNumber })
}
