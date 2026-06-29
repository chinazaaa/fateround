import { NextRequest, NextResponse } from 'next/server'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import {
  parseNpatMetadata,
  reviewTargetForMarker,
  answerStartsWithLetter,
  normalizeAnswer,
  duplicateKeysByCategory,
  isSingleLetterAnswer,
} from '@/lib/npat'
import { npatMarkSchema } from '@/lib/validation'
import type { NpatCategory } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatMarkSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, validName, validAnimal, validPlace, validThing, validFood } = body
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

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'marking') {
    return NextResponse.json({ error: 'Not in marking phase' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const markerId = auth.player.id

  const targetId = reviewTargetForMarker(metadata, markerId)
  if (!targetId) return NextResponse.json({ error: 'No review assignment for this player' }, { status: 400 })

  const { data: targetAnswer } = await supabase
    .from('npat_answers')
    .select('name, animal, place, thing, food')
    .eq('round_id', roundId)
    .eq('player_id', targetId)
    .maybeSingle()

  const { data: allAnswers } = await supabase
    .from('npat_answers')
    .select('name, animal, place, thing, food')
    .eq('round_id', roundId)

  const letter = metadata.letter
  const dupes = duplicateKeysByCategory(allAnswers ?? [])
  const clampValid = (category: NpatCategory, requested: boolean) => {
    if (!targetAnswer) return false
    const text = targetAnswer[category]
    const normalized = normalizeAnswer(text)
    const isDuplicate = normalized ? dupes[category].has(normalized) : false
    if (!normalized) return false
    if (isSingleLetterAnswer(text)) return false
    if (letter && !answerStartsWithLetter(text, letter)) return false
    if (isDuplicate) return false
    return requested
  }

  const now = new Date().toISOString()
  const { error } = await supabase.from('npat_marks').upsert(
    {
      game_id: code,
      round_id: roundId,
      marker_player_id: markerId,
      target_player_id: targetId,
      valid_name: clampValid('name', validName),
      valid_animal: clampValid('animal', validAnimal),
      valid_place: clampValid('place', validPlace),
      valid_thing: clampValid('thing', validThing),
      valid_food: clampValid('food', validFood),
      marked_at: now,
    },
    { onConflict: 'marker_player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
