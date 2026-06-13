import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canPlayerVoteInRound, getRoundParticipantGender } from '@/lib/participants'
import type { ParticipantGender } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { playerId, roundId, gameId, kiss, marry, kill } = await req.json()

  if (!playerId || !roundId || !gameId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [{ data: player }, { data: round }] = await Promise.all([
    supabase.from('players').select('id, gender').eq('id', playerId).maybeSingle(),
    supabase.from('rounds').select('participant_ids').eq('id', roundId).maybeSingle(),
  ])

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const { data: participants } = await supabase
    .from('participants')
    .select('id, gender')
    .in('id', round.participant_ids)

  const roundGender = getRoundParticipantGender(
    round.participant_ids,
    (participants ?? []).map((p) => ({
      id: p.id,
      gender: p.gender as ParticipantGender,
    }))
  )

  const playerGender =
    player.gender === 'male' ? 'male' : player.gender === 'both' ? 'both' : 'female'

  if (roundGender && !canPlayerVoteInRound(playerGender, roundGender)) {
    return NextResponse.json(
      { error: 'You cannot vote in this round — only the opposite gender votes' },
      { status: 403 }
    )
  }

  const { error } = await supabase.from('votes').upsert(
    {
      player_id: playerId,
      round_id: roundId,
      game_id: gameId,
      kiss_participant_id: kiss || null,
      marry_participant_id: marry || null,
      kill_participant_id: kill || null,
    },
    { onConflict: 'player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
