import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canPlayerVoteInRound, getRoundParticipantGender, playerVoteGenderForRound } from '@/lib/participants'
import {
  isAssignmentComplete,
  isPairAssignmentComplete,
  isPairGame,
  isThreeChoiceGame,
  isWouldYouRather,
  isMostLikelyTo,
  isLobbyGame,
  isNameOnlyPlayerJoin,
  parseGameType,
  parsePairVoteMode,
  isPairAssignmentValid,
  voteSlots,
} from '@/lib/game-types'
import type { PairFlag, WyrChoice } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function parsePairAssignments(raw: unknown): Record<string, PairFlag> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, PairFlag> = {}
  for (const [id, flag] of Object.entries(raw as Record<string, unknown>)) {
    if (flag === 'kiss' || flag === 'kill') out[id] = flag
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function POST(req: NextRequest) {
  const {
    playerId,
    roundId,
    gameId,
    kiss,
    marry,
    kill,
    pairAssignments: rawPairAssignments,
    wyrChoice: rawWyrChoice,
    targetPlayerId: rawTargetPlayerId,
    targetParticipantId: rawTargetParticipantId,
  } = await req.json()

  if (!playerId || !roundId || !gameId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [{ data: player }, { data: round }, { data: game }] = await Promise.all([
    supabase.from('players').select('id, gender, identity_gender, name').eq('id', playerId).maybeSingle(),
    supabase.from('rounds').select('participant_ids').eq('id', roundId).maybeSingle(),
    supabase.from('games').select('game_type, participant_mode, pair_vote_mode').eq('id', gameId.toUpperCase()).maybeSingle(),
  ])

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const gameType = parseGameType(game.game_type)
  const roundIds = round.participant_ids as string[]
  const roundIdSet = new Set(roundIds)

  let row: {
    kiss_participant_id: string | null
    marry_participant_id: string | null
    kill_participant_id: string | null
    pair_assignments: Record<string, PairFlag> | null
    wyr_choice: WyrChoice | null
    target_player_id: string | null
    target_participant_id: string | null
  }

  if (isMostLikelyTo(gameType)) {
    const isImport = game.participant_mode === 'import'

    if (isImport) {
      const targetParticipantId =
        typeof rawTargetParticipantId === 'string' ? rawTargetParticipantId : null
      if (!targetParticipantId) {
        return NextResponse.json({ error: 'Pick someone from the group' }, { status: 400 })
      }

      const { data: targetParticipant } = await supabase
        .from('participants')
        .select('id')
        .eq('id', targetParticipantId)
        .eq('game_id', gameId.toUpperCase())
        .maybeSingle()

      if (!targetParticipant) {
        return NextResponse.json({ error: 'Invalid pick — name not on the list' }, { status: 400 })
      }

      row = {
        kiss_participant_id: null,
        marry_participant_id: null,
        kill_participant_id: null,
        pair_assignments: null,
        wyr_choice: null,
        target_player_id: null,
        target_participant_id: targetParticipantId,
      }
    } else {
      const targetPlayerId = typeof rawTargetPlayerId === 'string' ? rawTargetPlayerId : null
      if (!targetPlayerId) {
        return NextResponse.json({ error: 'Pick someone from the group' }, { status: 400 })
      }

      const { data: targetPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('id', targetPlayerId)
        .eq('game_id', gameId.toUpperCase())
        .maybeSingle()

      if (!targetPlayer) {
        return NextResponse.json({ error: 'Invalid pick — player not in this game' }, { status: 400 })
      }

      row = {
        kiss_participant_id: null,
        marry_participant_id: null,
        kill_participant_id: null,
        pair_assignments: null,
        wyr_choice: null,
        target_player_id: targetPlayerId,
        target_participant_id: null,
      }
    }
  } else if (isWouldYouRather(gameType)) {
    const wyrChoice = rawWyrChoice === 'a' || rawWyrChoice === 'b' ? rawWyrChoice : null
    if (!wyrChoice) {
      return NextResponse.json({ error: 'Pick option A or B' }, { status: 400 })
    }
    row = {
      kiss_participant_id: null,
      marry_participant_id: null,
      kill_participant_id: null,
      pair_assignments: null,
      wyr_choice: wyrChoice,
      target_player_id: null,
      target_participant_id: null,
    }
  } else if (isPairGame(gameType)) {
    const pairAssignments = parsePairAssignments(rawPairAssignments)
    const pairMode = parsePairVoteMode(game.pair_vote_mode)
    if (!pairAssignments || !isPairAssignmentValid(pairAssignments, roundIds, pairMode)) {
      return NextResponse.json(
        {
          error: pairMode === 'one_each'
            ? 'Pick one of each option — not both the same'
            : 'Pick an option for each person',
        },
        { status: 400 }
      )
    }
    for (const id of roundIds) {
      const flag = pairAssignments[id]
      if (!flag || !roundIdSet.has(id)) {
        return NextResponse.json({ error: 'Invalid vote assignment' }, { status: 400 })
      }
    }
    row = {
      kiss_participant_id: null,
      marry_participant_id: null,
      kill_participant_id: null,
      pair_assignments: pairAssignments,
      wyr_choice: null,
      target_player_id: null,
      target_participant_id: null,
    }
  } else {
    const assignment = { kiss: kiss || null, marry: marry || null, kill: kill || null }

    if (!isAssignmentComplete(assignment, gameType)) {
      return NextResponse.json({ error: 'Incomplete vote — assign every option' }, { status: 400 })
    }

    for (const slot of voteSlots(gameType)) {
      const participantId = assignment[slot]
      if (!participantId || !roundIdSet.has(participantId)) {
        return NextResponse.json({ error: 'Invalid vote assignment' }, { status: 400 })
      }
    }

    const assignedIds = voteSlots(gameType).map((slot) => assignment[slot] as string)
    if (new Set(assignedIds).size !== assignedIds.length) {
      return NextResponse.json({ error: 'Each person can only get one assignment' }, { status: 400 })
    }

    row = {
      kiss_participant_id: assignment.kiss,
      marry_participant_id: isThreeChoiceGame(gameType) ? assignment.marry : null,
      kill_participant_id: assignment.kill,
      pair_assignments: null,
      wyr_choice: null,
      target_player_id: null,
      target_participant_id: null,
    }
  }

  if (!isLobbyGame(gameType) && !isMostLikelyTo(gameType)) {
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
  }

  const { error } = await supabase.from('votes').upsert(
    {
      player_id: playerId,
      round_id: roundId,
      game_id: gameId,
      ...row,
    },
    { onConflict: 'player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
