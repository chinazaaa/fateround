import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPlayerSchema, updatePlayerSchema, deletePlayerSchema } from '@/lib/validation'
import { normalizeGender, normalizePlayerGender, type ParticipantGender } from '@/lib/participants'
import { parseGameType, isNameOnlyPlayerJoin, isWhoSaidThis, isImportNameClaimGame } from '@/lib/game-types'
import { isGenderFreeImportJoin, isGenderFreeJoinersJoin, isGenderFreeVotersJoin } from '@/lib/gender-based'
import { isImportClaimMode, isJoinersPollMode, isVoterOnlyMode } from '@/lib/participant-mode'
import {
  assertHostGame,
  deleteJoinerPair,
  findJoinerParticipant,
  pollGenderForPlayer,
  syncImportParticipantBallot,
} from '@/lib/game-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function assertWaitingGame(gameCode: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase
    .from('games')
    .select('status, participant_mode, game_type, custom_slots, gender_based')
    .eq('id', id)
    .maybeSingle()

  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.status !== 'waiting') {
    return { error: 'Game has already started', status: 400 as const, game: null, id }
  }
  return { error: null, status: 200 as const, game, id }
}

async function nameTaken(gameId: string, name: string, excludePlayerId?: string) {
  let query = supabase.from('players').select('id').eq('game_id', gameId).ilike('name', name)
  if (excludePlayerId) query = query.neq('id', excludePlayerId)
  const { data } = await query.maybeSingle()
  return !!data
}

async function participantClaimed(gameId: string, participantId: string, excludePlayerId?: string) {
  let query = supabase.from('players').select('id').eq('game_id', gameId).eq('participant_id', participantId)
  if (excludePlayerId) query = query.neq('id', excludePlayerId)
  const { data } = await query.maybeSingle()
  return !!data
}

function resolveIdentityGender(
  rawIdentity: unknown,
  voteGender: 'male' | 'female' | 'both',
  fallback?: ParticipantGender | null
): ParticipantGender | null {
  const identity = normalizeGender(String(rawIdentity ?? ''))
  if (identity) return identity
  if (voteGender !== 'both') return voteGender
  return fallback ?? null
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createPlayerSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    gameCode,
    playerName,
    gender: rawGender,
    pollGender: rawPollGender,
    identityGender: rawIdentityGender,
    participantId: rawParticipantId,
  } = parsed.data

  const name = playerName?.trim() ?? ''
  const waiting = await assertWaitingGame(gameCode)
  if (waiting.error) return NextResponse.json({ error: waiting.error }, { status: waiting.status })
  const { game, id } = waiting
  const gameType = parseGameType(game!.game_type)

  if (isNameOnlyPlayerJoin(gameType)) {
    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }
    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  if (isGenderFreeJoinersJoin(game as import('@/types').Game)) {
    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }
    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('id, name').eq('game_id', id)
    const displayOrder = existingPlayers?.length ?? 0

    const { data: participant, error: partError } = await supabase
      .from('participants')
      .insert({
        game_id: id,
        name,
        gender: 'female',
        display_order: displayOrder,
      })
      .select()
      .single()

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: participant.id,
      })
      .select()
      .single()

    if (playerError) {
      await supabase.from('participants').delete().eq('id', participant.id)
      return NextResponse.json({ error: playerError.message }, { status: 500 })
    }

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  if (isGenderFreeVotersJoin(game as import('@/types').Game)) {
    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }
    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  if (isGenderFreeImportJoin(game as import('@/types').Game) && isImportClaimMode(game as import('@/types').Game)) {
    const participantId = String(rawParticipantId ?? '').trim()
    if (!participantId) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('id, name').eq('game_id', id)

    const { data: participant } = await supabase
      .from('participants')
      .select('id, name')
      .eq('id', participantId)
      .eq('game_id', id)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    if (await participantClaimed(id, participantId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const claimName = participant.name
    if (existingPlayers?.some((p) => p.name.toLowerCase() === claimName.toLowerCase())) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name: claimName,
        gender: 'both',
        identity_gender: null,
        participant_id: participantId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  const gender = normalizePlayerGender(String(rawGender ?? ''))
  if (!gender) {
    return NextResponse.json({ error: 'Please select male, female, or both' }, { status: 400 })
  }

  if (isImportClaimMode(game as import('@/types').Game)) {
    const participantId = String(rawParticipantId ?? '').trim()
    if (!participantId) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('id, name').eq('game_id', id)

    const { data: participant } = await supabase
      .from('participants')
      .select('id, name, gender')
      .eq('id', participantId)
      .eq('game_id', id)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    if (await participantClaimed(id, participantId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const claimName = participant.name
    if (existingPlayers?.some((p) => p.name.toLowerCase() === claimName.toLowerCase())) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const identityGender = resolveIdentityGender(
      rawIdentityGender,
      gender,
      participant.gender === 'male' ? 'male' : 'female'
    )
    if (!identityGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name: claimName,
        gender,
        identity_gender: identityGender,
        participant_id: participantId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await syncImportParticipantBallot(supabase, id, participantId, gender, identityGender, rawPollGender ?? undefined)

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  if (!name) {
    return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
  }

  const { data: existingPlayers } = await supabase.from('players').select('id, name').eq('game_id', id)

  if (existingPlayers?.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
  }

  if (isVoterOnlyMode(game as import('@/types').Game)) {
    const identityGender = resolveIdentityGender(rawIdentityGender, gender, null)
    if (!identityGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name,
        gender,
        identity_gender: identityGender,
        participant_id: null,
      })
      .select()
      .single()

    if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  if (isJoinersPollMode(game as import('@/types').Game)) {
    const identityGender = resolveIdentityGender(rawIdentityGender, gender, null)
    if (!identityGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }
    const pollGender =
      gender === 'both' ? normalizeGender(String(rawPollGender ?? '')) ?? identityGender : gender
    if (!pollGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }
    const displayOrder = existingPlayers?.length ?? 0

    const { data: participant, error: partError } = await supabase
      .from('participants')
      .insert({
        game_id: id,
        name,
        gender: pollGender,
        display_order: displayOrder,
      })
      .select()
      .single()

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: id,
        name,
        gender,
        identity_gender: identityGender,
        participant_id: participant.id,
      })
      .select()
      .single()

    if (playerError) {
      await supabase.from('participants').delete().eq('id', participant.id)
      return NextResponse.json({ error: playerError.message }, { status: 500 })
    }

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
    })
  }

  return NextResponse.json({ error: 'Invalid game mode' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const rawBody = await req.json()
  const parsedPatch = updatePlayerSchema.safeParse(rawBody)
  if (!parsedPatch.success) {
    return NextResponse.json({ error: parsedPatch.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    gameCode,
    playerId,
    playerName: rawName,
    gender: rawGender,
    pollGender: rawPollGender,
    identityGender: rawIdentityGender,
    participantId: rawParticipantId,
    hostToken,
  } = parsedPatch.data

  let game: { participant_mode: string } | null
  let id: string

  if (hostToken) {
    const auth = await assertHostGame(supabase, gameCode, hostToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    game = auth.game
    id = auth.id
  } else {
    const waiting = await assertWaitingGame(gameCode)
    if (waiting.error) return NextResponse.json({ error: waiting.error }, { status: waiting.status })
    game = waiting.game
    id = waiting.id
  }

  const { data: player } = await supabase.from('players').select('*').eq('id', playerId).eq('game_id', id).maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const gameType = parseGameType((game as { game_type?: string }).game_type)

  if (isNameOnlyPlayerJoin(gameType)) {
    if (rawName === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (await nameTaken(id, name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: updatedPlayer, error } = await supabase
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: updatedPlayer.id,
      playerName: updatedPlayer.name,
      playerGender: updatedPlayer.gender,
    })
  }

  if (isGenderFreeJoinersJoin(game as import('@/types').Game)) {
    if (rawName === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (await nameTaken(id, name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: updatedPlayer, error } = await supabase
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (player.participant_id) {
      await supabase.from('participants').update({ name }).eq('id', player.participant_id)
    }

    return NextResponse.json({
      playerId: updatedPlayer.id,
      playerName: updatedPlayer.name,
      playerGender: updatedPlayer.gender,
      playerIdentityGender: updatedPlayer.identity_gender,
    })
  }

  if (isGenderFreeVotersJoin(game as import('@/types').Game)) {
    if (rawName === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (await nameTaken(id, name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: updatedPlayer, error } = await supabase
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: updatedPlayer.id,
      playerName: updatedPlayer.name,
      playerGender: updatedPlayer.gender,
      playerIdentityGender: updatedPlayer.identity_gender,
    })
  }

  if (isGenderFreeImportJoin(game as import('@/types').Game) && isImportClaimMode(game as import('@/types').Game)) {
    if (rawParticipantId === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const participantId = String(rawParticipantId ?? '').trim()
    if (!participantId) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    const { data: participant } = await supabase
      .from('participants')
      .select('id, name')
      .eq('id', participantId)
      .eq('game_id', id)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }

    if (await participantClaimed(id, participantId, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    if (await nameTaken(id, participant.name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: updatedPlayer, error } = await supabase
      .from('players')
      .update({
        name: participant.name,
        participant_id: participantId,
        gender: 'both',
        identity_gender: null,
      })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      playerId: updatedPlayer.id,
      playerName: updatedPlayer.name,
      playerGender: updatedPlayer.gender,
      playerIdentityGender: updatedPlayer.identity_gender,
    })
  }

  const updates: {
    name?: string
    gender?: 'male' | 'female' | 'both'
    identity_gender?: 'male' | 'female'
    participant_id?: string | null
  } = {}

  if (isImportClaimMode(game as import('@/types').Game) && rawParticipantId !== undefined) {
    const participantId = String(rawParticipantId ?? '').trim()
    if (!participantId) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }
    const { data: participant } = await supabase
      .from('participants')
      .select('id, name, gender')
      .eq('id', participantId)
      .eq('game_id', id)
      .maybeSingle()
    if (!participant) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }
    if (await participantClaimed(id, participantId, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }
    if (await nameTaken(id, participant.name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }
    updates.name = participant.name
    updates.participant_id = participantId
  } else if (rawName !== undefined) {
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (await nameTaken(id, name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }
    if (isImportClaimMode(game as import('@/types').Game)) {
      return NextResponse.json({ error: 'Select your name from the game list' }, { status: 400 })
    }
    updates.name = name
  }

  let voteGender = player.gender as 'male' | 'female' | 'both'
  if (rawGender !== undefined) {
    const gender = normalizePlayerGender(String(rawGender))
    if (!gender) return NextResponse.json({ error: 'Please select male, female, or both' }, { status: 400 })
    updates.gender = gender
    voteGender = gender
  }

  if (rawIdentityGender !== undefined) {
    const fallbackParticipantGender = updates.participant_id
      ? (await supabase.from('participants').select('gender').eq('id', updates.participant_id).maybeSingle()).data
          ?.gender
      : player.participant_id
        ? (await supabase.from('participants').select('gender').eq('id', player.participant_id).maybeSingle()).data
            ?.gender
        : null
    const identityGender = resolveIdentityGender(
      rawIdentityGender,
      voteGender,
      fallbackParticipantGender === 'male' ? 'male' : fallbackParticipantGender === 'female' ? 'female' : null
    )
    if (!identityGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }
    updates.identity_gender = identityGender
  } else if (updates.gender !== undefined) {
    const fallbackParticipantGender = updates.participant_id
      ? (await supabase.from('participants').select('gender').eq('id', updates.participant_id).maybeSingle()).data
          ?.gender
      : player.participant_id
        ? (await supabase.from('participants').select('gender').eq('id', player.participant_id).maybeSingle()).data
            ?.gender
        : null
    const identityGender = resolveIdentityGender(
      player.identity_gender,
      voteGender,
      fallbackParticipantGender === 'male' ? 'male' : fallbackParticipantGender === 'female' ? 'female' : null
    )
    if (identityGender) updates.identity_gender = identityGender
  }

  const effectiveVotePref = updates.gender ?? voteGender
  if (updates.identity_gender && effectiveVotePref !== 'both') {
    updates.gender = updates.identity_gender
    voteGender = updates.identity_gender
  }

  if (Object.keys(updates).length === 0 && rawPollGender === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const participant =
    game!.participant_mode === 'joiners' ? await findJoinerParticipant(supabase, id, player.name) : null

  const pollGender = pollGenderForPlayer(
    voteGender,
    rawPollGender,
    participant?.gender ?? (voteGender === 'both' ? 'female' : voteGender),
    normalizeGender(String(updates.identity_gender ?? player.identity_gender ?? ''))
  )

  if (game!.participant_mode === 'joiners' && voteGender === 'both' && !pollGender) {
    return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
  }

  const { data: updatedPlayer, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (game!.participant_mode === 'joiners' && participant) {
    const partUpdates: { name?: string; gender?: 'male' | 'female' } = {}
    if (updates.name) partUpdates.name = updates.name
    if (pollGender) partUpdates.gender = pollGender
    else if (updates.gender && updates.gender !== 'both') partUpdates.gender = updates.gender

    if (Object.keys(partUpdates).length > 0) {
      await supabase.from('participants').update(partUpdates).eq('id', participant.id)
    }
  }

  if (isImportClaimMode(game as import('@/types').Game)) {
    const participantId = updatedPlayer.participant_id ?? player.participant_id
    const identityGender = normalizeGender(String(updatedPlayer.identity_gender ?? ''))
    if (participantId && identityGender) {
      await syncImportParticipantBallot(
        supabase,
        id,
        participantId,
        updatedPlayer.gender as 'male' | 'female' | 'both',
        identityGender,
        rawPollGender
      )
    }
  }

  return NextResponse.json({
    playerId: updatedPlayer.id,
    playerName: updatedPlayer.name,
    playerGender: updatedPlayer.gender,
  })
}

export async function DELETE(req: NextRequest) {
  const rawDel = await req.json()
  const parsedDel = deletePlayerSchema.safeParse(rawDel)
  if (!parsedDel.success) {
    return NextResponse.json({ error: parsedDel.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameCode, playerId, hostToken } = parsedDel.data

  let game: { participant_mode: string } | null
  let id: string

  if (hostToken) {
    const auth = await assertHostGame(supabase, gameCode, hostToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    game = auth.game
    id = auth.id
  } else {
    const waiting = await assertWaitingGame(gameCode)
    if (waiting.error) return NextResponse.json({ error: waiting.error }, { status: waiting.status })
    game = waiting.game
    id = waiting.id
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, name')
    .eq('id', playerId)
    .eq('game_id', id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (game!.participant_mode === 'joiners') {
    await deleteJoinerPair(supabase, id, player)
  } else {
    const { error } = await supabase.from('players').delete().eq('id', playerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
