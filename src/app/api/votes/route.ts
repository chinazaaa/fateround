import { NextRequest, NextResponse } from 'next/server'
import { isVoterOnlyMode } from '@/lib/participant-mode'
import { createVoteSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { canPlayerVoteInRound, getRoundParticipantGender, playerVoteGenderForRound } from '@/lib/participants'
import {
  isAssignmentComplete,
  isPairGame,
  isBinaryPeoplePollGame,
  isThreeChoiceGame,
  isBinaryChoiceGame,
  isNeverHaveIEver,
  isPickANumber,
  isMostLikelyTo,
  isWhoSaidThis,
  isLobbyGame,
  parseGameType,
  parsePairVoteMode,
  isPairAssignmentValid,
  voteSlots,
  isCustomGame,
} from '@/lib/game-types'
import { isGameGenderBased, supportsGenderToggle } from '@/lib/gender-based'
import { parseCustomAssignments, isCustomAssignmentValid, customAssignmentMode } from '@/lib/custom-game'
import { playerIsViewer } from '@/lib/viewers'
import { parsePickANumberPool, pickANumberQuestionAt } from '@/lib/pick-a-number'
import type { PairFlag, WyrChoice } from '@/types'
import { parseJsonBody } from '@/lib/parse-body'

function parsePairAssignments(raw: unknown): Record<string, PairFlag> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, PairFlag> = {}
  for (const [id, flag] of Object.entries(raw as Record<string, unknown>)) {
    if (flag === 'kiss' || flag === 'kill') out[id] = flag
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, createVoteSchema)
  if (bodyError) return bodyError

  const {
    resumeToken,
    roundId,
    gameId,
    kiss,
    marry,
    kill,
    pairAssignments: rawPairAssignments,
    wyrChoice: rawWyrChoice,
    targetPlayerId: rawTargetPlayerId,
    targetParticipantId: rawTargetParticipantId,
    pickedNumber: rawPickedNumber,
  } = body

  const supabase = getSupabaseAdmin()

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const player = auth.player
  const playerId = player.id

  const [{ data: round }, { data: game }] = await Promise.all([
    // Scope the round to the authorized game so a known roundId from another game is rejected.
    supabase
      .from('rounds')
      .select('participant_ids, submitter_player_id, quote_text')
      .eq('id', roundId)
      .eq('game_id', gameId.toUpperCase())
      .maybeSingle(),
    supabase
      .from('games')
      .select(
        'game_type, participant_mode, pair_vote_mode, custom_slots, gender_based, status, session_started_at, custom_questions'
      )
      .eq('id', gameId.toUpperCase())
      .maybeSingle(),
  ])

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (playerIsViewer(player, game)) {
    return NextResponse.json({ error: 'Viewers cannot vote' }, { status: 403 })
  }

  const gameType = parseGameType(game.game_type)
  const roundIds = round.participant_ids as string[]
  const roundIdSet = new Set(roundIds)

  let row: {
    kiss_participant_id: string | null
    marry_participant_id: string | null
    kill_participant_id: string | null
    pair_assignments: Record<string, PairFlag | string> | null
    wyr_choice: WyrChoice | null
    target_player_id: string | null
    target_participant_id: string | null
    anime_choice?: string | null
    picked_number?: number | null
  }

  if (isWhoSaidThis(gameType)) {
    const { data: fullRound } = await supabase.from('rounds').select('anime_metadata').eq('id', roundId).maybeSingle()

    const animeMetadata = fullRound?.anime_metadata as { choices: string[]; correct_character: string } | null

    if (animeMetadata) {
      // Anime round: validate anime_choice
      if (!round.quote_text) {
        return NextResponse.json({ error: 'Waiting for the quote' }, { status: 400 })
      }

      const animeChoice = typeof body.animeChoice === 'string' ? body.animeChoice : null
      if (!animeChoice) {
        return NextResponse.json({ error: 'Pick a character' }, { status: 400 })
      }
      if (!animeMetadata.choices.includes(animeChoice)) {
        return NextResponse.json({ error: 'Invalid pick — not one of the choices' }, { status: 400 })
      }

      row = {
        kiss_participant_id: null,
        marry_participant_id: null,
        kill_participant_id: null,
        pair_assignments: null,
        wyr_choice: null,
        target_player_id: null,
        target_participant_id: null,
        anime_choice: animeChoice,
      }
    } else {
      // Player round: existing logic
      if (round.submitter_player_id === playerId) {
        return NextResponse.json({ error: 'The writer does not vote on their own quote' }, { status: 400 })
      }
      if (!round.quote_text) {
        return NextResponse.json({ error: 'Waiting for the quote before voting' }, { status: 400 })
      }

      const targetParticipantId = typeof rawTargetParticipantId === 'string' ? rawTargetParticipantId : null
      if (!targetParticipantId) {
        return NextResponse.json({ error: 'Pick who said it' }, { status: 400 })
      }
      if (!roundIdSet.has(targetParticipantId)) {
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
    }
  } else if (isPickANumber(gameType)) {
    if (round.submitter_player_id !== playerId) {
      return NextResponse.json({ error: 'Only the picker can choose a number this round' }, { status: 403 })
    }
    const pickedNumber =
      typeof rawPickedNumber === 'number' && Number.isInteger(rawPickedNumber) ? rawPickedNumber : null
    const pool = parsePickANumberPool(game.custom_questions)
    if (!pickedNumber || pickedNumber < 1 || pickedNumber > pool.length) {
      return NextResponse.json({ error: `Pick a number between 1 and ${pool.length}` }, { status: 400 })
    }

    const { data: priorPicks } = await supabase
      .from('votes')
      .select('picked_number')
      .eq('game_id', gameId.toUpperCase())
      .neq('round_id', roundId)
      .not('picked_number', 'is', null)

    const usedNumbers = new Set(
      (priorPicks ?? [])
        .map((row) => row.picked_number)
        .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    )
    if (usedNumbers.has(pickedNumber)) {
      return NextResponse.json({ error: 'That number was already picked — choose another' }, { status: 400 })
    }
    const revealedQuestion = pickANumberQuestionAt(pool, pickedNumber)
    if (!revealedQuestion) {
      return NextResponse.json({ error: 'Invalid number for this question list' }, { status: 400 })
    }

    row = {
      kiss_participant_id: null,
      marry_participant_id: null,
      kill_participant_id: null,
      pair_assignments: null,
      wyr_choice: null,
      target_player_id: null,
      target_participant_id: null,
      picked_number: pickedNumber,
    }

    const { error: revealError } = await supabase
      .from('rounds')
      .update({ mlt_question: revealedQuestion })
      .eq('id', roundId)
    if (revealError) {
      return NextResponse.json({ error: revealError.message }, { status: 500 })
    }
  } else if (isNeverHaveIEver(gameType)) {
    const wyrChoice = rawWyrChoice === 'a' || rawWyrChoice === 'b' ? rawWyrChoice : null
    if (!wyrChoice) {
      return NextResponse.json({ error: "Pick I have or I haven't" }, { status: 400 })
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
  } else if (isMostLikelyTo(gameType)) {
    const isImport = isVoterOnlyMode(game)

    if (isImport) {
      const targetParticipantId = typeof rawTargetParticipantId === 'string' ? rawTargetParticipantId : null
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
  } else if (isBinaryChoiceGame(gameType)) {
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
  } else if (isCustomGame(gameType)) {
    const customAssignments = parseCustomAssignments(body.customAssignments)
    if (!customAssignments) {
      return NextResponse.json({ error: 'Assign everyone to a category' }, { status: 400 })
    }

    const { data: fullGame } = await supabase
      .from('games')
      .select('custom_slots, pair_vote_mode')
      .eq('id', gameId.toUpperCase())
      .maybeSingle()

    const slotKeys = fullGame?.custom_slots?.slots?.map((s: { key: string }) => s.key) ?? []
    if (slotKeys.length === 0) {
      return NextResponse.json({ error: 'Game has no custom slots configured' }, { status: 400 })
    }

    const customMode = customAssignmentMode(
      { pair_vote_mode: fullGame?.pair_vote_mode, custom_slots: fullGame?.custom_slots },
      roundIds.length,
      slotKeys
    )

    if (!isCustomAssignmentValid(customAssignments, roundIds, slotKeys, customMode)) {
      return NextResponse.json(
        {
          error:
            customMode === 'one_each'
              ? 'Invalid assignment — assign one person per category'
              : 'Pick a category for each person',
        },
        { status: 400 }
      )
    }

    row = {
      kiss_participant_id: null,
      marry_participant_id: null,
      kill_participant_id: null,
      pair_assignments: customAssignments as Record<string, string>,
      wyr_choice: null,
      target_player_id: null,
      target_participant_id: null,
    }
  } else if (isBinaryPeoplePollGame(gameType)) {
    const pairAssignments = parsePairAssignments(rawPairAssignments)
    const pairMode = parsePairVoteMode(game.pair_vote_mode)
    if (!pairAssignments || !isPairAssignmentValid(pairAssignments, roundIds, pairMode)) {
      return NextResponse.json(
        {
          error:
            pairMode === 'one_each' ? 'Pick one of each option — not both the same' : 'Pick an option for each person',
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

  if (
    !isLobbyGame(gameType) &&
    !isNeverHaveIEver(gameType) &&
    !isMostLikelyTo(gameType) &&
    !isWhoSaidThis(gameType) &&
    !(supportsGenderToggle(gameType) && !isGameGenderBased(game))
  ) {
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

  if (isPickANumber(gameType)) {
    const pool = parsePickANumberPool(game.custom_questions)
    const picked = row.picked_number ?? null
    return NextResponse.json({
      success: true,
      pickedNumber: picked,
      revealedQuestion: picked ? pickANumberQuestionAt(pool, picked) : null,
    })
  }

  return NextResponse.json({ success: true })
}
