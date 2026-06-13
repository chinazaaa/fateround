import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canPlayerVoteInRound, getRoundParticipantGender, playerVoteGenderForRound } from '@/lib/participants'
import { isAssignmentComplete, isThreeChoiceGame, parseGameType, voteSlots } from '@/lib/game-types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { playerId, roundId, gameId, kiss, marry, kill } = await req.json()

  if (!playerId || !roundId || !gameId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [{ data: player }, { data: round }, { data: game }] = await Promise.all([
    supabase.from('players').select('id, gender, identity_gender, name').eq('id', playerId).maybeSingle(),
    supabase.from('rounds').select('participant_ids').eq('id', roundId).maybeSingle(),
    supabase.from('games').select('game_type').eq('id', gameId.toUpperCase()).maybeSingle(),
  ])

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const gameType = parseGameType(game.game_type)
  const assignment = { kiss: kiss || null, marry: marry || null, kill: kill || null }
  const roundIds = new Set(round.participant_ids)

  if (!isAssignmentComplete(assignment, gameType)) {
    return NextResponse.json({ error: 'Incomplete vote — assign every option' }, { status: 400 })
  }

  for (const slot of voteSlots(gameType)) {
    const participantId = assignment[slot]
    if (!participantId || !roundIds.has(participantId)) {
      return NextResponse.json({ error: 'Invalid vote assignment' }, { status: 400 })
    }
  }

  const assignedIds = voteSlots(gameType).map((slot) => assignment[slot] as string)
  if (new Set(assignedIds).size !== assignedIds.length) {
    return NextResponse.json({ error: 'Each person can only get one assignment' }, { status: 400 })
  }

  const { data: participants } = await supabase
    .from('participants')
    .select('id, gender')
    .in('id', round.participant_ids)

  const roundGender = getRoundParticipantGender(
    round.participant_ids,
    (participants ?? []).map((p) => ({
      id: p.id,
      gender: p.gender,
    }))
  )

  const playerGender = playerVoteGenderForRound(player)
  if (!playerGender) {
    return NextResponse.json({ error: 'Invalid player gender' }, { status: 400 })
  }

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
      kiss_participant_id: assignment.kiss,
      marry_participant_id: isThreeChoiceGame(gameType) ? assignment.marry : null,
      kill_participant_id: assignment.kill,
    },
    { onConflict: 'player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
