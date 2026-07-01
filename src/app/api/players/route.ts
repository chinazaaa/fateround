import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPlayerSchema, updatePlayerSchema, deletePlayerSchema } from '@/lib/validation'
import { internalErrorMessage } from '@/lib/api-errors'
import { normalizeGender, normalizePlayerGender, type ParticipantGender } from '@/lib/participants'
import { removeMonopolyPlayer } from '@/lib/monopoly'
import { removeScrabblePlayer } from '@/lib/scrabble'
import { removeWhotPlayer } from '@/lib/whot'
import { removeCrazyEightsPlayer } from '@/lib/crazy-eights'
import { removeLudoPlayer } from '@/lib/ludo'
import { removeSnakeAndLadderPlayer } from '@/lib/snake-and-ladder'
import { removeYahtzeePlayer } from '@/lib/yahtzee'
import { removeChessPlayer } from '@/lib/chess'
import { removeCheckersPlayer } from '@/lib/checkers'
import { removeTicTacToePlayer } from '@/lib/tic-tac-toe'
import { isMonopolyTokenId } from '@/lib/monopoly-tokens'
import { generateAnonymousDisplayName } from '@/lib/anonymous-names'
import { anonymousPlayerCanChat } from '@/lib/anonymous-messages'
import { createBingoCardForPlayer } from '@/lib/bingo'
import { assignCodewordsLateJoinOperative, codewordsAllowsPlayerChanges, removeCodewordsPlayer } from '@/lib/codewords'
import { assignDescribeItLateJoinTeam } from '@/lib/describe-it'
import {
  parseGameType,
  isNameOnlyPlayerJoin,
  isHotSeat,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isBingoGame,
  isCodewordsGame,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isCrazyEightsGame,
  isLudoGame,
  isSnakeAndLadderGame,
  isTicTacToeGame,
  isChessGame,
  isCheckersGame,
  isScrabbleGame,
  isDescribeItGame,
  isTwoTruthsGame,
} from '@/lib/game-types'
import { fetchGamePlayerLimits, isLobbyLimitGameType, lobbyMaxPlayersFromGame } from '@/lib/game-limits'
import { isGenderFreeImportJoin, isGenderFreeJoinersJoin, isGenderFreeVotersJoin } from '@/lib/gender-based'
import { isImportClaimMode, isJoinersPollMode, isVoterOnlyMode } from '@/lib/participant-mode'
import {
  assertHostGame,
  assertHostPlayerRemove,
  assertPlayer,
  deleteJoinerPair,
  findJoinerParticipant,
  pollGenderForPlayer,
  syncImportParticipantBallot,
} from '@/lib/game-admin'
import {
  canJoinGame,
  playerIsViewer,
  spectatorForActiveJoin,
  gameOffersLateJoinChoice,
  allowLateJoin,
  allowLatePlayers,
} from '@/lib/viewers'
import type { Game } from '@/types'
import { linkPlayerToRoomMember, resolveRoomMemberForGame } from '@/lib/room-points'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function assertWaitingGame(gameCode: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase
    .from('games')
    .select('status, participant_mode, game_type, custom_slots, gender_based, max_players')
    .eq('id', id)
    .maybeSingle()

  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.status !== 'waiting') {
    return { error: 'Game has already started', status: 400 as const, game: null, id }
  }
  return { error: null, status: 200 as const, game, id }
}

async function assertPlayerSessionGame(gameCode: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase
    .from('games')
    .select('status, participant_mode, game_type, custom_slots, gender_based, max_players')
    .eq('id', id)
    .maybeSingle()

  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }

  const gameType = parseGameType(game.game_type)
  if (isCodewordsGame(gameType)) {
    if (!codewordsAllowsPlayerChanges(game.status)) {
      return { error: 'This round has ended', status: 400 as const, game: null, id }
    }
  } else if (game.status !== 'waiting' && game.status !== 'active' && game.status !== 'finished') {
    return { error: 'Game is not open', status: 400 as const, game: null, id }
  }

  return { error: null, status: 200 as const, game, id }
}

function playerJoinResponse(
  player: {
    id: string
    name: string
    gender: string
    identity_gender: string | null
    joined_at: string
    spectator?: boolean
    resume_token?: string | null
  },
  game: Pick<Game, 'status' | 'session_started_at'>,
  extra: Record<string, unknown> = {}
) {
  return {
    playerId: player.id,
    playerName: player.name,
    playerGender: player.gender,
    playerIdentityGender: player.identity_gender,
    resumeToken: player.resume_token ?? null,
    isViewer: playerIsViewer(player, game),
    ...extra,
  }
}

async function jsonPlayerJoin(
  roomMemberId: string | null,
  player: Parameters<typeof playerJoinResponse>[0],
  game: Parameters<typeof playerJoinResponse>[1],
  extra: Record<string, unknown> = {}
) {
  await linkPlayerToRoomMember(supabase, player.id, roomMemberId)
  return NextResponse.json(playerJoinResponse(player, game, extra))
}

function lateJoinChoiceError(
  game: Pick<Game, 'status' | 'game_type' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join'>,
  joinAsViewer: boolean | undefined
): string | null {
  if (game.status !== 'active') return null
  if (!gameOffersLateJoinChoice(parseGameType(game.game_type))) return null
  if (!allowLatePlayers(game)) {
    if (joinAsViewer === false) return 'This game only allows late joiners to watch'
    return null
  }
  if (joinAsViewer === undefined) return 'Choose to join as a viewer or player'
  return null
}

function spectatorOnJoin(game: Game, joinAsViewer: boolean | undefined): boolean {
  // An explicit "watch only" join (e.g. tournament spectators) is always a spectator,
  // even while the game is still in the lobby — spectatorForActiveJoin only spectates
  // active games, which would otherwise make a lobby watcher a real player.
  if (joinAsViewer === true) return true
  return spectatorForActiveJoin(game, joinAsViewer)
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
  const { data: body, error: bodyError } = await parseJsonBody(req, createPlayerSchema)
  if (bodyError) return bodyError

  const {
    gameCode,
    playerName,
    gender: rawGender,
    pollGender: rawPollGender,
    identityGender: rawIdentityGender,
    participantId: rawParticipantId,
    joinAsViewer: rawJoinAsViewer,
    monopolyToken: rawMonopolyToken,
    roomMemberCode,
  } = body

  let name = playerName?.trim() ?? ''
  const gameId = gameCode.toUpperCase()
  const { data: gameRow } = await getSupabaseAdmin().from('games').select('*').eq('id', gameId).maybeSingle()
  if (!gameRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const roomMember = await resolveRoomMemberForGame(supabase, gameId, roomMemberCode)
  const roomMemberId = roomMember?.id ?? null
  if (!name && roomMember?.display_name) {
    name = roomMember.display_name.trim()
  }

  const rowGameType = parseGameType(gameRow.game_type)
  const lobbyLimits = await fetchGamePlayerLimits(supabase)

  if (isAnonymousMessagesGame(rowGameType)) {
    if (gameRow.status === 'finished') {
      return NextResponse.json({ error: 'This session has ended' }, { status: 400 })
    }
    if (gameRow.status === 'active' && !allowLateJoin(gameRow as Game)) {
      return NextResponse.json(
        { error: 'This session has started — wait for the host to open the lobby again' },
        { status: 400 }
      )
    }
    if (gameRow.status !== 'waiting' && gameRow.status !== 'active') {
      return NextResponse.json({ error: 'Cannot join this session' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('anonymous_messages', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This room is full' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('name').eq('game_id', gameId)
    const generatedName = generateAnonymousDisplayName((existingPlayers ?? []).map((p) => p.name))

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name: generatedName,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: spectatorOnJoin(gameRow as Game, true),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    await linkPlayerToRoomMember(supabase, player.id, roomMemberId)

    const canChat = anonymousPlayerCanChat(player, gameRow)

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
      resumeToken: player.resume_token ?? null,
      canChat,
    })
  }

  if (isSecretMessageGame(rowGameType)) {
    if (gameRow.status !== 'active') {
      return NextResponse.json({ error: 'This board is closed' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('name').eq('game_id', gameId)
    const generatedName = generateAnonymousDisplayName((existingPlayers ?? []).map((p) => p.name))

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name: generatedName,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    await linkPlayerToRoomMember(supabase, player.id, roomMemberId)

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
      resumeToken: player.resume_token ?? null,
      canChat: true,
    })
  }

  if (isBingoGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }
    const choiceError = lateJoinChoiceError(gameRow as Game, rawJoinAsViewer)
    if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 })

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('bingo', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This bingo room is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    if (gameRow.status === 'waiting' || (gameRow.status === 'active' && !isSpectator)) {
      const { error: cardError } = await createBingoCardForPlayer(getSupabaseAdmin(), gameId, player.id)
      if (cardError) return NextResponse.json({ error: cardError }, { status: 500 })
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isMonopolyGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('monopoly', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false

    if (!isSpectator) {
      if (!rawMonopolyToken || !isMonopolyTokenId(rawMonopolyToken)) {
        return NextResponse.json({ error: 'Pick a player token to join' }, { status: 400 })
      }
      const { data: tokenTaken } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('monopoly_token', rawMonopolyToken)
        .maybeSingle()
      if (tokenTaken) {
        return NextResponse.json({ error: 'That token is already taken — pick another' }, { status: 400 })
      }
    }

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
        monopoly_token: isSpectator ? null : rawMonopolyToken,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That token is already taken — pick another' }, { status: 400 })
      }
      return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isYahtzeeGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('yahtzee', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isWhotGame(rowGameType) || isCrazyEightsGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const limitKey = isCrazyEightsGame(rowGameType) ? 'crazy_eights' : 'whot'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isLudoGame(rowGameType) || isSnakeAndLadderGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const limitKey = isSnakeAndLadderGame(rowGameType) ? 'snake_and_ladder' : 'ludo'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (
    isTicTacToeGame(rowGameType) ||
    isChessGame(rowGameType) ||
    isCheckersGame(rowGameType) ||
    isScrabbleGame(rowGameType)
  ) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const limitKey = isChessGame(rowGameType)
      ? 'chess'
      : isCheckersGame(rowGameType)
        ? 'checkers'
        : isScrabbleGame(rowGameType)
          ? 'scrabble'
          : 'tic_tac_toe'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isCodewordsGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }
    const choiceError = lateJoinChoiceError(gameRow as Game, rawJoinAsViewer)
    if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 })

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('codewords', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (gameRow.status === 'active' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    if (gameRow.status === 'active' && !isSpectator) {
      const { role, error: assignError } = await assignCodewordsLateJoinOperative(getSupabaseAdmin(), gameId, player.id)
      if (assignError) {
        await getSupabaseAdmin().from('players').delete().eq('id', player.id)
        return NextResponse.json({ error: assignError }, { status: 500 })
      }
      return jsonPlayerJoin(roomMemberId, player, gameRow as Game, role ? { codewordsRole: role } : {})
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  if (isDescribeItGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }
    const choiceError = lateJoinChoiceError(gameRow as Game, rawJoinAsViewer)
    if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 })

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('describe_it', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
    if ((playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This game is full' }, { status: 400 })
    }

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)
    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: internalErrorMessage('describe-it:join', error) }, { status: 500 })

    // Late joiner as a player → auto-assign to the smallest team so they can play.
    if (gameRow.status === 'active' && !isSpectator) {
      const { error: assignError } = await assignDescribeItLateJoinTeam(getSupabaseAdmin(), gameId, player.id)
      if (assignError) {
        await getSupabaseAdmin().from('players').delete().eq('id', player.id)
        return NextResponse.json({ error: assignError }, { status: 500 })
      }
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game)
  }

  const joinCheck = canJoinGame(gameRow as Game)
  if (!joinCheck.ok) {
    return NextResponse.json({ error: joinCheck.error }, { status: 400 })
  }
  const game = gameRow
  const id = gameId
  const gameType = parseGameType(game.game_type)
  const choiceError = lateJoinChoiceError(game as Game, rawJoinAsViewer)
  if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 })
  const joinSpectator = spectatorOnJoin(game as Game, rawJoinAsViewer)

  if (isNameOnlyPlayerJoin(gameType) || (isHotSeat(gameType) && isJoinersPollMode(game as import('@/types').Game))) {
    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    if (isLobbyLimitGameType(gameType)) {
      const maxPlayers = lobbyMaxPlayersFromGame(gameType, game!, lobbyLimits)
      const { count: playerCount } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', id)

      if (game.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
        return NextResponse.json({ error: 'This room is full' }, { status: 400 })
      }
    }

    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game)
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

    const { data: participant, error: partError } = await getSupabaseAdmin()
      .from('participants')
      .insert({
        game_id: id,
        name,
        gender: 'female',
        display_order: displayOrder,
      })
      .select()
      .single()

    if (partError) return NextResponse.json({ error: internalErrorMessage('players', partError) }, { status: 500 })

    const { data: player, error: playerError } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: participant.id,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (playerError) {
      await getSupabaseAdmin().from('participants').delete().eq('id', participant.id)
      return NextResponse.json({ error: internalErrorMessage('players', playerError) }, { status: 500 })
    }

    return jsonPlayerJoin(roomMemberId, player, game as Game)
  }

  if (isGenderFreeVotersJoin(game as import('@/types').Game)) {
    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }
    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game)
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

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name: claimName,
        gender: 'both',
        identity_gender: null,
        participant_id: participantId,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game)
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

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name: claimName,
        gender,
        identity_gender: identityGender,
        participant_id: participantId,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    await syncImportParticipantBallot(supabase, id, participantId, gender, identityGender, rawPollGender ?? undefined)

    return jsonPlayerJoin(roomMemberId, player, game as Game)
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

    const { data: player, error: playerError } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name,
        gender,
        identity_gender: identityGender,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (playerError) return NextResponse.json({ error: internalErrorMessage('players', playerError) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game)
  }

  if (isJoinersPollMode(game as import('@/types').Game)) {
    const identityGender = resolveIdentityGender(rawIdentityGender, gender, null)
    if (!identityGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }
    const pollGender = gender === 'both' ? (normalizeGender(String(rawPollGender ?? '')) ?? identityGender) : gender
    if (!pollGender) {
      return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
    }
    const displayOrder = existingPlayers?.length ?? 0

    const { data: participant, error: partError } = await getSupabaseAdmin()
      .from('participants')
      .insert({
        game_id: id,
        name,
        gender: pollGender,
        display_order: displayOrder,
      })
      .select()
      .single()

    if (partError) return NextResponse.json({ error: internalErrorMessage('players', partError) }, { status: 500 })

    const { data: player, error: playerError } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        name,
        gender,
        identity_gender: identityGender,
        participant_id: participant.id,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (playerError) {
      await getSupabaseAdmin().from('participants').delete().eq('id', participant.id)
      return NextResponse.json({ error: internalErrorMessage('players', playerError) }, { status: 500 })
    }

    return jsonPlayerJoin(roomMemberId, player, game as Game)
  }

  return NextResponse.json({ error: 'Invalid game mode' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, updatePlayerSchema)
  if (bodyError) return bodyError

  const {
    gameCode,
    playerId,
    playerName: rawName,
    gender: rawGender,
    pollGender: rawPollGender,
    identityGender: rawIdentityGender,
    participantId: rawParticipantId,
    hostToken,
    resumeToken,
  } = body

  let game: { participant_mode: string } | null
  let id: string

  if (hostToken) {
    const auth = await assertHostGame(getSupabaseAdmin(), gameCode, hostToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    game = auth.game
    id = auth.id
  } else {
    const session = await assertPlayerSessionGame(gameCode)
    if (session.error) return NextResponse.json({ error: session.error }, { status: session.status })
    // Non-host callers may only edit their OWN player — prove ownership via resume_token.
    const owner = await assertPlayer(getSupabaseAdmin(), gameCode, resumeToken)
    if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status })
    if (owner.player.id !== playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    game = session.game
    id = session.id
  }

  const { data: player } = await getSupabaseAdmin()
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('game_id', id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const gameType = parseGameType((game as { game_type?: string }).game_type)

  if (isNameOnlyPlayerJoin(gameType) || (isHotSeat(gameType) && isJoinersPollMode(game as import('@/types').Game))) {
    if (rawName === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (await nameTaken(id, name, playerId)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: updatedPlayer, error } = await getSupabaseAdmin()
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

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

    const { data: updatedPlayer, error } = await getSupabaseAdmin()
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    if (player.participant_id) {
      await getSupabaseAdmin().from('participants').update({ name }).eq('id', player.participant_id)
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

    const { data: updatedPlayer, error } = await getSupabaseAdmin()
      .from('players')
      .update({ name })
      .eq('id', playerId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

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

    const { data: updatedPlayer, error } = await getSupabaseAdmin()
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

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

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

  const { data: updatedPlayer, error } = await getSupabaseAdmin()
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

  if (game!.participant_mode === 'joiners' && participant) {
    const partUpdates: { name?: string; gender?: 'male' | 'female' } = {}
    if (updates.name) partUpdates.name = updates.name
    if (pollGender) partUpdates.gender = pollGender
    else if (updates.gender && updates.gender !== 'both') partUpdates.gender = updates.gender

    if (Object.keys(partUpdates).length > 0) {
      await getSupabaseAdmin().from('participants').update(partUpdates).eq('id', participant.id)
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
  const { data: body, error: bodyError } = await parseJsonBody(req, deletePlayerSchema)
  if (bodyError) return bodyError

  const { gameCode, playerId, hostToken, resumeToken } = body

  let game: { participant_mode: string } | null
  let id: string

  if (hostToken) {
    const code = gameCode.toUpperCase()
    const { data: hostGame } = await getSupabaseAdmin().from('games').select('*').eq('id', code).maybeSingle()
    if (!hostGame) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (hostGame.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    if (isAnonymousMessagesGame(parseGameType(hostGame.game_type))) {
      if (hostGame.status !== 'waiting' && hostGame.status !== 'active') {
        return NextResponse.json({ error: 'Players can only be removed before the session ends' }, { status: 400 })
      }
      game = hostGame
      id = code
    } else if (isCodewordsGame(parseGameType(hostGame.game_type))) {
      if (!codewordsAllowsPlayerChanges(hostGame.status)) {
        return NextResponse.json(
          { error: 'Players can only be removed while the lobby or game is open' },
          { status: 400 }
        )
      }
      game = hostGame
      id = code
    } else if (isTwoTruthsGame(parseGameType(hostGame.game_type))) {
      if (hostGame.status === 'finished') {
        return NextResponse.json(
          { error: 'Players can only be removed while the lobby or game is active' },
          { status: 400 }
        )
      }
      game = hostGame
      id = code
    } else {
      const auth = await assertHostPlayerRemove(getSupabaseAdmin(), gameCode, hostToken)
      if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
      game = auth.game
      id = auth.id
    }
  } else {
    const session = await assertPlayerSessionGame(gameCode)
    if (session.error) return NextResponse.json({ error: session.error }, { status: session.status })
    // Non-host callers may only remove themselves — prove ownership via resume_token.
    const owner = await assertPlayer(getSupabaseAdmin(), gameCode, resumeToken)
    if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status })
    if (owner.player.id !== playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    game = session.game
    id = session.id
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, name')
    .eq('id', playerId)
    .eq('game_id', id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const gameType = parseGameType((game as { game_type?: string }).game_type)

  if (isCodewordsGame(gameType)) {
    const { error } = await removeCodewordsPlayer(getSupabaseAdmin(), id, playerId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isMonopolyGame(gameType)) {
    const { error } = await removeMonopolyPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isScrabbleGame(gameType)) {
    const { error } = await removeScrabblePlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWhotGame(gameType)) {
    const { error } = await removeWhotPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCrazyEightsGame(gameType)) {
    const { error } = await removeCrazyEightsPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isLudoGame(gameType)) {
    const { error } = await removeLudoPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isSnakeAndLadderGame(gameType)) {
    // Snake & Ladder tables are RLS-locked to anon writes — remove via service role.
    // (Caller authority — host, or the player removing themselves — is enforced above.)
    const { error } = await removeSnakeAndLadderPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isYahtzeeGame(gameType)) {
    const { error } = await removeYahtzeePlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isChessGame(gameType)) {
    const { error } = await removeChessPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCheckersGame(gameType)) {
    const { error } = await removeCheckersPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isTicTacToeGame(gameType)) {
    // Tic-Tac-Toe tables are RLS-locked to anon writes — remove via service role.
    // (Caller authority — host, or the player removing themselves — is enforced above.)
    const { error } = await removeTicTacToePlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (game!.participant_mode === 'joiners') {
    const { error } = await deleteJoinerPair(getSupabaseAdmin(), id, player)
    if (error) return NextResponse.json({ error: internalErrorMessage('players', { message: error }) }, { status: 500 })
  } else {
    const { error } = await getSupabaseAdmin().from('players').delete().eq('id', playerId)
    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
