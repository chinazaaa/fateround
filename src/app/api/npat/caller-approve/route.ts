import { NextRequest, NextResponse } from 'next/server'
import { approveNpatRound } from '@/lib/npat-advance'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { NPAT_CATEGORIES, parseNpatMetadata } from '@/lib/npat'
import { npatCallerApproveSchema } from '@/lib/validation'
import type { NpatMetadata } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatCallerApproveSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, overrides } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isICallOnGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an I Call On game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // The caller is the player whose turn it is — only they may approve the round.
  if (round.submitter_player_id !== auth.player.id) {
    return NextResponse.json({ error: 'Only the letter caller can approve this round' }, { status: 403 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'host_review') {
    return NextResponse.json({ error: 'Round is not awaiting approval' }, { status: 400 })
  }

  const callerOverrides: NonNullable<NpatMetadata['host_overrides']> = {}
  for (const row of overrides) {
    callerOverrides[row.playerId] = {
      name: row.validName,
      animal: row.validAnimal,
      place: row.validPlace,
      thing: row.validThing,
      food: row.validFood,
    }
  }

  for (const targetPlayerId of Object.keys(callerOverrides)) {
    const entry = callerOverrides[targetPlayerId]
    if (!entry) continue
    for (const category of NPAT_CATEGORIES) {
      if (typeof entry[category] !== 'boolean') {
        return NextResponse.json({ error: 'Missing validity for a player category' }, { status: 400 })
      }
    }
  }

  const ok = await approveNpatRound(supabase, code, roundId, callerOverrides)
  if (!ok) return NextResponse.json({ error: 'Failed to approve round' }, { status: 500 })

  return NextResponse.json({ success: true })
}
