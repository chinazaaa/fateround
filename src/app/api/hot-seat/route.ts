import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hotSeatSubmissionSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = hotSeatSubmissionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, roundId, playerId, text, submissionType } = parsed.data

  // Validate game exists and is active
  const { data: game } = await supabase.from('games').select('id, status').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })

  // Validate round exists and is active
  const { data: round } = await supabase
    .from('rounds')
    .select('id, status, submitter_player_id, game_id')
    .eq('id', roundId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (round.status !== 'active') return NextResponse.json({ error: 'Round is not active' }, { status: 400 })

  // Validate player is in this game
  const { data: player } = await supabase
    .from('players')
    .select('id, game_id')
    .eq('id', playerId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found in this game' }, { status: 404 })

  // Player cannot submit about themselves (the hot seat player)
  if (round.submitter_player_id === playerId) {
    return NextResponse.json({ error: 'You cannot submit about yourself while in the hot seat' }, { status: 400 })
  }

  // Upsert on round_id + player_id
  const { data: submission, error } = await supabase
    .from('hot_seat_submissions')
    .upsert(
      {
        game_id: gameId,
        round_id: roundId,
        player_id: playerId,
        text,
        submission_type: submissionType,
      },
      { onConflict: 'round_id,player_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, submission })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roundId = searchParams.get('roundId')
  const gameId = searchParams.get('gameId')

  if (!roundId || !gameId) {
    return NextResponse.json({ error: 'roundId and gameId are required' }, { status: 400 })
  }

  // Check round status — only return submissions if round is finished
  const { data: round } = await supabase
    .from('rounds')
    .select('id, status, submitter_player_id, game_id')
    .eq('id', roundId)
    .eq('game_id', gameId.toUpperCase())
    .maybeSingle()

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  if (round.status !== 'finished') {
    return NextResponse.json({ error: 'Submissions are only visible after the round ends' }, { status: 403 })
  }

  const { data: submissions, error } = await supabase
    .from('hot_seat_submissions')
    .select('*')
    .eq('round_id', roundId)
    .eq('game_id', gameId.toUpperCase())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ submissions: submissions ?? [] })
}
