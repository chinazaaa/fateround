import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { playerId, roundId, gameId, quoteText } = await req.json()

  if (!playerId || !roundId || !gameId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const quote = typeof quoteText === 'string' ? quoteText.trim() : ''
  if (!quote) {
    return NextResponse.json({ error: 'Enter a quote before submitting' }, { status: 400 })
  }
  if (quote.length > 500) {
    return NextResponse.json({ error: 'Quote is too long (500 characters max)' }, { status: 400 })
  }

  const [{ data: round }, { data: game }] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, status, submitter_player_id, quote_text, game_id')
      .eq('id', roundId)
      .maybeSingle(),
    supabase.from('games').select('status, game_type').eq('id', gameId.toUpperCase()).maybeSingle(),
  ])

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (round.status !== 'active') return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  if (round.game_id !== gameId.toUpperCase()) {
    return NextResponse.json({ error: 'Round does not belong to this game' }, { status: 400 })
  }
  if (round.submitter_player_id !== playerId) {
    return NextResponse.json({ error: 'Only the assigned writer can submit this quote' }, { status: 403 })
  }
  if (round.quote_text) {
    return NextResponse.json({ error: 'Quote already submitted for this round' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rounds')
    .update({ quote_text: quote, quote_submitted_at: now })
    .eq('id', roundId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, quoteText: quote })
}
