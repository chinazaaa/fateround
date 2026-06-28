import { NextRequest, NextResponse } from 'next/server'
import { hotSeatSubmissionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { supabase as supabaseReadonly } from '@/lib/supabase'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = hotSeatSubmissionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, roundId, resumeToken, text, submissionType } = parsed.data

  const supabase = getSupabaseAdmin()

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

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

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

  // Public read — use the anon client (anon SELECT stays open); no need for the service role.
  const supabase = supabaseReadonly

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
