import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createQuoteSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createQuoteSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { playerId, roundId, gameId, quoteText, authorParticipantId } = parsed.data

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
