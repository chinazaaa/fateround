import { NextRequest, NextResponse } from 'next/server'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, isForcedInvalidAnswer, normalizeAnswer, duplicateKeysByCategory } from '@/lib/npat'
import { npatDisputeSchema } from '@/lib/validation'
import type { NpatCategory, NpatDispute } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatDisputeSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, targetPlayerId, category } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isICallOnGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an I Call On game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'host_review') {
    return NextResponse.json({ error: 'Disputes can only be raised during the approval phase' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (playerId === targetPlayerId) {
    return NextResponse.json({ error: 'Cannot dispute your own answer' }, { status: 400 })
  }

  const { data: allAnswers } = await supabase
    .from('npat_answers')
    .select('name, animal, place, thing, food, player_id')
    .eq('round_id', roundId)

  const targetAnswer = (allAnswers ?? []).find((a) => a.player_id === targetPlayerId)
  if (!targetAnswer) return NextResponse.json({ error: 'Target player has no answer this round' }, { status: 400 })

  const text = targetAnswer[category as NpatCategory] as string
  const dupes = duplicateKeysByCategory(allAnswers ?? [])
  const normalized = normalizeAnswer(text)
  const isDuplicate = normalized ? dupes[category as NpatCategory].has(normalized) : false

  if (isForcedInvalidAnswer(text, metadata.letter, isDuplicate)) {
    return NextResponse.json({ error: 'Answer is already automatically invalid' }, { status: 400 })
  }
  if (!normalized) {
    return NextResponse.json({ error: 'Cannot dispute an empty answer' }, { status: 400 })
  }

  const existing: NpatDispute[] = metadata.disputes ?? []

  // Toggle: remove if this challenger already disputed this exact answer, add if not
  const alreadyDisputed = existing.some(
    (d) => d.challenger_id === playerId && d.target_player_id === targetPlayerId && d.category === category
  )

  const updated = alreadyDisputed
    ? existing.filter(
        (d) => !(d.challenger_id === playerId && d.target_player_id === targetPlayerId && d.category === category)
      )
    : [...existing, { challenger_id: playerId, target_player_id: targetPlayerId, category }]

  const newMetadata = { ...(round.npat_metadata as object), disputes: updated }
  const { error } = await supabase.from('rounds').update({ npat_metadata: newMetadata }).eq('id', roundId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, disputed: !alreadyDisputed })
}
