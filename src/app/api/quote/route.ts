import { NextRequest, NextResponse } from 'next/server'
import { createQuoteSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, createQuoteSchema)
  if (bodyError) return bodyError

  const { resumeToken, roundId, gameId, quoteText, authorParticipantId } = body

  const supabase = getSupabaseAdmin()

  const [{ data: round }, { data: game }] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, status, submitter_player_id, quote_text, quote_author_participant_id, participant_ids, game_id')
      .eq('id', roundId)
      .maybeSingle(),
    supabase.from('games').select('status, game_type').eq('id', gameId).maybeSingle(),
  ])

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (round.status !== 'active') return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  if (round.game_id !== gameId) {
    return NextResponse.json({ error: 'Round does not belong to this game' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (round.submitter_player_id !== playerId) {
    return NextResponse.json({ error: 'Only the assigned writer can submit this quote' }, { status: 403 })
  }
  if (round.quote_text) {
    return NextResponse.json({ error: 'Quote already submitted for this round' }, { status: 400 })
  }

  const roundIds = (round.participant_ids as string[]) ?? []
  if (!roundIds.includes(authorParticipantId)) {
    return NextResponse.json({ error: 'Pick a name from the game list' }, { status: 400 })
  }

  const { data: authorParticipant } = await supabase
    .from('participants')
    .select('id')
    .eq('id', authorParticipantId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (!authorParticipant) {
    return NextResponse.json({ error: 'Invalid name — not on the list' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rounds')
    .update({
      quote_text: quoteText,
      quote_author_participant_id: authorParticipantId,
      quote_submitted_at: now,
    })
    .eq('id', roundId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, quoteText, authorParticipantId })
}
