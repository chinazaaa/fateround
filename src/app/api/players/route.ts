import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { createPlayerSchema, updatePlayerSchema, deletePlayerSchema } from '@/lib/validation'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { internalErrorMessage } from '@/lib/api-errors'
import { normalizeGender, normalizePlayerGender, type ParticipantGender } from '@/lib/participants'
import { generateResumeToken, normalizeResumeToken } from '@/lib/utils'
import { removeMonopolyPlayer } from '@/lib/monopoly'
import { removeScrabblePlayer } from '@/lib/scrabble'
import { removeWhotPlayer } from '@/lib/whot'
import { removeCrazyEightsPlayer } from '@/lib/crazy-eights'
import { removeUnoPlayer } from '@/lib/uno'
import { removeLudoPlayer } from '@/lib/ludo'
import { removeMahjongPlayer } from '@/lib/mahjong'
import { removeSnakeAndLadderPlayer } from '@/lib/snake-and-ladder'
import { removeYahtzeePlayer } from '@/lib/yahtzee'
import { removeChessPlayer } from '@/lib/chess'
import { removeCheckersPlayer } from '@/lib/checkers'
import { removeDraughts10Player } from '@/lib/draughts10'
import { removeAyoPlayer } from '@/lib/ayo'
import { maybeNotifyHostPlayerJoined } from '@/lib/push'
import { getProfileFromRequest } from '@/lib/identity-server'
import { removeTicTacToePlayer } from '@/lib/tic-tac-toe'
import { isMonopolyTokenId } from '@/lib/monopoly-tokens'
import { generateAnonymousDisplayName } from '@/lib/anonymous-names'
import { anonymousPlayerCanChat } from '@/lib/anonymous-messages'
import { createBingoCardForPlayer } from '@/lib/bingo'
import {
  assignCodewordsLateJoinOperative,
  codewordsAllowsPlayerChanges,
  reconcileCodewordsTeamAfterRemoval,
  removeCodewordsPlayer,
} from '@/lib/codewords'
import { assignDescribeItLateJoinTeam, reconcileDescribeItAfterRemoval } from '@/lib/describe-it'
import { registerQuickDrawLateJoinPlayer } from '@/lib/quick-draw'
import { reconcileQuickDrawGuessAfterRemoval } from '@/lib/quick-draw-guess'
import {
  assignWordRushLateJoinTeam,
  revertWordRushRosterAfterFailedPlayerDelete,
  syncWordRushAfterPlayerRemoved,
} from '@/lib/word-rush-server'
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
  isUnoGame,
  isLudoGame,
  isMahjongGame,
  isSnakeAndLadderGame,
  isTicTacToeGame,
  isChessGame,
  isCheckersGame,
  isDraughts10Game,
  isAyoGame,
  isScrabbleGame,
  isDescribeItGame,
  isWordRushGame,
  isQuickDrawGame,
  isSudokuGame,
  isTwoTruthsGame,
  isMafiaGame,
} from '@/lib/game-types'
import { announceMafiaLateJoin } from '@/lib/mafia'
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
import { finishSudokuIfAllPlayersDone } from '@/lib/sudoku-finish'
import { linkPlayerToRoomMember, resolveRoomMemberForGame } from '@/lib/room-points'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = getSupabaseAnon()

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
  extra: Record<string, unknown> = {},
  joinerUserId: string | null = null
) {
  await linkPlayerToRoomMember(supabase, player.id, roomMemberId)
  // Attribute the seat to the caller's profile so future joins from another
  // device by the same profile can detect the collision. Best-effort — a
  // failure here mustn't turn a successful join into a 500.
  if (joinerUserId) {
    await getSupabaseAdmin()
      .from('players')
      .update({ user_id: joinerUserId })
      .eq('id', (player as { id: string }).id)
      .then(
        () => undefined,
        () => undefined
      )
  }
  // Discovery Phase A: fire a directed push to the host so they know somebody
  // arrived. The helper self-gates (waiting + is_public + non-host + 60s dedup);
  // wrap in a best-effort to keep the join response fast — a failed push must
  // never turn a successful join into a 500.
  void maybeNotifyHostPlayerJoined(
    String((game as { id?: string }).id ?? (player as { game_id?: string }).game_id ?? '').toUpperCase(),
    String(player.name ?? ''),
    String((player as { id?: string }).id ?? '')
  ).catch(() => {
    // Best-effort — never block a join on a push failure.
  })
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

// Decide what to do when a waiting lobby has no open seats. Returns a NextResponse to
// return immediately, or `null` to admit the joiner as a spectator ("watch instead").
// The watch fallback is only offered when the game allows viewers — a game with viewers
// turned off still turns a full lobby away with a plain "full" error (no `full` flag, so
// the client shows no "watch instead" affordance).
function seatFullGate(game: Game, seatsFull: boolean, joinAsViewer: boolean | undefined, message: string) {
  if (!seatsFull) return null
  const canWatch = allowLateJoin(game)
  if (joinAsViewer === true && canWatch) return null
  return NextResponse.json(canWatch ? { error: message, full: true } : { error: message }, { status: 400 })
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
  const limited = await enforceRateLimit(req, RATE_LIMITS.join)
  if (limited) return limited

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
    tournamentToken,
  } = body

  let name = playerName?.trim() ?? ''
  const country = req.headers.get('cf-ipcountry') ?? null
  const gameId = gameCode.toUpperCase()
  const { data: gameRow } = await getSupabaseAdmin().from('games').select('*').eq('id', gameId).maybeSingle()
  if (!gameRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const roomMember = await resolveRoomMemberForGame(supabase, gameId, roomMemberCode)
  const roomMemberId = roomMember?.id ?? null
  if (!name && roomMember?.display_name) {
    name = roomMember.display_name.trim()
  }

  // Cross-device continuation: if the caller is a signed-in profile that is
  // already hosting this game, or already sitting in it from another device,
  // return a soft 409 so the client can prompt "Continue here / Keep on the
  // other device" instead of silently seating a second copy of the same
  // account. The client retries with continueOnThisDevice: true to bypass —
  // and when they were already a player, we hand back the existing row so
  // they pick up right where they left off instead of starting a new seat.
  const joinerUserId = await getProfileFromRequest(req)
  const continueOnThisDevice = body.continueOnThisDevice === true
  if (joinerUserId) {
    const hostUserId = (gameRow as { host_user_id?: string | null }).host_user_id ?? null
    if (hostUserId && hostUserId === joinerUserId && !continueOnThisDevice) {
      return NextResponse.json(
        {
          error: 'You’re already hosting this game on another device.',
          reason: 'already_hosting',
          gameCode: gameId,
        },
        { status: 409 }
      )
    }
    const { data: existingPlayer } = await getSupabaseAdmin()
      .from('players')
      .select('id, name, gender, identity_gender, joined_at, spectator, is_eliminated, resume_token')
      .eq('game_id', gameId)
      .eq('user_id', joinerUserId)
      .maybeSingle()
    if (existingPlayer) {
      if (!continueOnThisDevice) {
        return NextResponse.json(
          {
            error: 'You’re already a player in this game on another device.',
            reason: 'already_joined',
            gameCode: gameId,
            existingPlayerName: (existingPlayer as { name?: string | null }).name ?? null,
          },
          { status: 409 }
        )
      }
      // Continue on this device: rotate the resume token first so the old
      // device's stored token stops authenticating — a "Continue here" must
      // move control, not clone it. Only the freshly-minted token is returned
      // to this device.
      const rotatedResumeToken = generateResumeToken()
      const { data: rotated, error: rotateError } = await getSupabaseAdmin()
        .from('players')
        .update({ resume_token: rotatedResumeToken })
        .eq('id', (existingPlayer as { id: string }).id)
        .select('id, name, gender, identity_gender, joined_at, spectator, is_eliminated, resume_token')
        .single()
      if (rotateError || !rotated) {
        return NextResponse.json({ error: internalErrorMessage('players', rotateError) }, { status: 500 })
      }
      return jsonPlayerJoin(roomMemberId, rotated, gameRow as Game, {}, joinerUserId)
    }
  }

  // Reconnect / refresh reclaim: if this device already holds a seat in this game — proven
  // by its resume_token (saved locally at join) — return THAT row instead of creating a new
  // one. Without this, re-entering an *active* game falls through to the join branches below,
  // where active-game joins default to spectator, silently demoting a real player to a viewer
  // after a network blip. Idempotent and role-preserving; mirrors the tournament reclaim below.
  if (body.resumeToken) {
    const token = normalizeResumeToken(body.resumeToken)
    if (token.length >= 4) {
      const { data: existing } = await getSupabaseAdmin()
        .from('players')
        .select('id, name, gender, identity_gender, joined_at, spectator, is_eliminated, resume_token')
        .eq('game_id', gameId)
        .eq('resume_token', token)
        .maybeSingle()
      if (existing) {
        const reclaimType = parseGameType(gameRow.game_type)
        if (
          isQuickDrawGame(reclaimType) &&
          gameRow.status === 'active' &&
          existing.spectator !== true &&
          existing.is_eliminated !== true
        ) {
          const { error: assignError } = await registerQuickDrawLateJoinPlayer(getSupabaseAdmin(), gameId, existing.id)
          if (assignError) return NextResponse.json({ error: assignError }, { status: 500 })
        }
        return jsonPlayerJoin(roomMemberId, existing, gameRow as Game, {}, joinerUserId)
      }
    }
  }

  // Tournament games have no per-game login: a player is identified by the secret
  // token they got when they joined the tournament (kept in their browser, sent here).
  // Verify it so only the real player can take or reclaim their seat, and so a reload /
  // new tab / reconnect lands them back in it instead of being told their name is taken.
  if (gameRow.tournament_id) {
    const admin = getSupabaseAdmin()
    let verifiedName: string | null = null
    if (tournamentToken) {
      const { data: tokenRow } = await admin
        .from('tournament_player_tokens')
        .select('player_id')
        .eq('tournament_id', gameRow.tournament_id)
        .eq('token', tournamentToken)
        .maybeSingle()
      if (tokenRow) {
        const { data: tp } = await admin
          .from('tournament_players')
          .select('player_name')
          .eq('id', tokenRow.player_id)
          .maybeSingle()
        if (tp) verifiedName = tp.player_name
      }
    }

    if (verifiedName) {
      // Identity proven: force the canonical tournament name (ignore any spoofed name),
      // and resume an existing seat in this room if there is one.
      name = verifiedName
      const { data: existingRows } = await admin
        .from('players')
        .select('id, name, gender, identity_gender, spectator, resume_token, joined_at')
        .eq('game_id', gameId)
        .ilike('name', name)
        .order('joined_at', { ascending: true })
        .limit(1)
      const existing = existingRows?.[0]
      if (existing) return jsonPlayerJoin(roomMemberId, existing, gameRow as Game, {}, joinerUserId)
      // Otherwise fall through to a normal first-time seat under the canonical name.
    } else if (name) {
      // No valid token: refuse to let this join take a name that belongs to a
      // tournament participant — that's the impersonation we're preventing. Watchers
      // use generated names that never match a participant, so they're unaffected.
      const { data: clash } = await admin
        .from('tournament_players')
        .select('id')
        .eq('tournament_id', gameRow.tournament_id)
        .ilike('player_name', name)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: 'That name belongs to a tournament player — open the game from your tournament lobby to join.' },
          { status: 403 }
        )
      }
    }
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
      .eq('spectator', false)

    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers) {
      return NextResponse.json({ error: 'This room is full' }, { status: 400 })
    }

    const { data: existingPlayers } = await supabase.from('players').select('name').eq('game_id', gameId)
    const generatedName = generateAnonymousDisplayName((existingPlayers ?? []).map((p) => p.name))

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
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
        country,
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
      .eq('spectator', false)

    const seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This bingo room is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    if (!isSpectator && (gameRow.status === 'waiting' || gameRow.status === 'active')) {
      const { error: cardError } = await createBingoCardForPlayer(getSupabaseAdmin(), gameId, player.id)
      if (cardError) return NextResponse.json({ error: cardError }, { status: 500 })
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
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
      .eq('spectator', false)

    let seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers

    // ── Bots-in-room: humans never lose a seat to a bot (Monopoly branch) ──
    // Mirrors the Whot eviction below. Lobby only — a Monopoly seat mid-game
    // carries cash + properties + position that we can't safely transfer to a
    // joining human, so mid-game arrivals fall through to spectator seating
    // and can take a real seat at the next replay.
    if (seatsFull && rawJoinAsViewer !== true) {
      const { data: newestBot } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('is_bot', true)
        .eq('spectator', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (newestBot) {
        // LIFO eviction — same behaviour Whot ships. The delete cascades the
        // bot's monopoly_token so the joining human can claim it.
        await getSupabaseAdmin().from('players').delete().eq('id', newestBot.id).eq('game_id', gameId)
        seatsFull = false
      }
    }

    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator =
      seatsFull ||
      // An EXPLICIT "watch only" join is a spectator even in a waiting lobby. Without this the
      // seat-based games ignored `joinAsViewer` until the game was active, so a deliberate
      // viewer — most visibly the host who chose "Host only" — was treated as a real player
      // and made to satisfy the player-join rules (Monopoly demanded a board token). This is
      // the same clause `spectatorOnJoin` carries; the active-game branch below keeps its
      // hardcoded `true` because these games never admit a mid-game player.
      rawJoinAsViewer === true ||
      (gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false)

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
        country,
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

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
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
      .eq('spectator', false)

    const seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator =
      seatsFull ||
      // An EXPLICIT "watch only" join is a spectator even in a waiting lobby. Without this the
      // seat-based games ignored `joinAsViewer` until the game was active, so a deliberate
      // viewer — most visibly the host who chose "Host only" — was treated as a real player
      // and made to satisfy the player-join rules (Monopoly demanded a board token). This is
      // the same clause `spectatorOnJoin` carries; the active-game branch below keeps its
      // hardcoded `true` because these games never admit a mid-game player.
      rawJoinAsViewer === true ||
      (gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
  }

  if (isWhotGame(rowGameType) || isCrazyEightsGame(rowGameType) || isUnoGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const limitKey = isCrazyEightsGame(rowGameType) ? 'crazy_eights' : isUnoGame(rowGameType) ? 'uno' : 'whot'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('spectator', false)

    // ── Bots-in-room: humans never lose a seat to a bot ────────────────────
    // If the room is at cap but any of the seats are bots (Whot only for now
    // — see docs/bots-in-room-plan.md), evict the newest bot to make room
    // for the human, in the lobby only. Mid-game bot eviction is a Phase 2
    // improvement: dealing a mid-game hand to a joining human needs engine
    // help we haven't wired for `waiting` → `active` transition yet.
    let seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    if (seatsFull && isWhotGame(rowGameType) && rawJoinAsViewer !== true) {
      const { data: newestBot } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('is_bot', true)
        .eq('spectator', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (newestBot) {
        // LIFO — the newest bot cedes first. Comes with a small race window:
        // if two humans arrive simultaneously to a room with N bots, both
        // may see N bots and each try to evict; the delete is idempotent so
        // the second just gets a 0-row result. Worst case one human still
        // hits "room full" and retries — no data corruption.
        await getSupabaseAdmin().from('players').delete().eq('id', newestBot.id).eq('game_id', gameId)
        seatsFull = false
      }
    }

    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator =
      seatsFull ||
      // An EXPLICIT "watch only" join is a spectator even in a waiting lobby. Without this the
      // seat-based games ignored `joinAsViewer` until the game was active, so a deliberate
      // viewer — most visibly the host who chose "Host only" — was treated as a real player
      // and made to satisfy the player-join rules (Monopoly demanded a board token). This is
      // the same clause `spectatorOnJoin` carries; the active-game branch below keeps its
      // hardcoded `true` because these games never admit a mid-game player.
      rawJoinAsViewer === true ||
      (gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
  }

  if (isLudoGame(rowGameType) || isMahjongGame(rowGameType) || isSnakeAndLadderGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const limitKey = isSnakeAndLadderGame(rowGameType)
      ? 'snake_and_ladder'
      : isMahjongGame(rowGameType)
        ? 'mahjong'
        : 'ludo'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('spectator', false)

    const seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator =
      seatsFull ||
      // An EXPLICIT "watch only" join is a spectator even in a waiting lobby. Without this the
      // seat-based games ignored `joinAsViewer` until the game was active, so a deliberate
      // viewer — most visibly the host who chose "Host only" — was treated as a real player
      // and made to satisfy the player-join rules (Monopoly demanded a board token). This is
      // the same clause `spectatorOnJoin` carries; the active-game branch below keeps its
      // hardcoded `true` because these games never admit a mid-game player.
      rawJoinAsViewer === true ||
      (gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
  }

  if (
    isTicTacToeGame(rowGameType) ||
    isChessGame(rowGameType) ||
    isCheckersGame(rowGameType) ||
    isAyoGame(rowGameType) ||
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
        : isAyoGame(rowGameType)
          ? 'ayo'
          : isScrabbleGame(rowGameType)
            ? 'scrabble'
            : 'tic_tac_toe'
    const maxPlayers = lobbyMaxPlayersFromGame(limitKey, gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('spectator', false)

    const seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator =
      seatsFull ||
      // An EXPLICIT "watch only" join is a spectator even in a waiting lobby. Without this the
      // seat-based games ignored `joinAsViewer` until the game was active, so a deliberate
      // viewer — most visibly the host who chose "Host only" — was treated as a real player
      // and made to satisfy the player-join rules (Monopoly demanded a board token). This is
      // the same clause `spectatorOnJoin` carries; the active-game branch below keeps its
      // hardcoded `true` because these games never admit a mid-game player.
      rawJoinAsViewer === true ||
      (gameRow.status === 'active' ? spectatorForActiveJoin(gameRow as Game, true) : false)

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
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
      .eq('spectator', false)

    const seatsFull = gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

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
        country,
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
      return jsonPlayerJoin(roomMemberId, player, gameRow as Game, role ? { codewordsRole: role } : {}, joinerUserId)
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
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
      .eq('spectator', false)
    const seatsFull = (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)
    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
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

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
  }

  if (isWordRushGame(rowGameType)) {
    const joinCheck = canJoinGame(gameRow as Game)
    if (!joinCheck.ok) {
      return NextResponse.json({ error: joinCheck.error }, { status: 400 })
    }
    const choiceError = lateJoinChoiceError(gameRow as Game, rawJoinAsViewer)
    if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 })

    if (!name) {
      return NextResponse.json({ error: 'playerName is required' }, { status: 400 })
    }

    const maxPlayers = lobbyMaxPlayersFromGame('word_rush', gameRow, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('spectator', false)
    const seatsFull = (playerCount ?? 0) >= maxPlayers
    const seatFullResp = seatFullGate(gameRow as Game, seatsFull, rawJoinAsViewer, 'This game is full')
    if (seatFullResp) return seatFullResp

    if (await nameTaken(gameId, name)) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 400 })
    }

    const isSpectator = spectatorOnJoin(gameRow as Game, rawJoinAsViewer)
    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: gameId,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: isSpectator,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: internalErrorMessage('word-rush:join', error) }, { status: 500 })

    if (gameRow.status === 'active' && !isSpectator) {
      const { error: assignError } = await assignWordRushLateJoinTeam(getSupabaseAdmin(), gameId, player.id)
      if (assignError) {
        await getSupabaseAdmin().from('players').delete().eq('id', player.id)
        return NextResponse.json({ error: assignError }, { status: 500 })
      }
    }

    return jsonPlayerJoin(roomMemberId, player, gameRow as Game, {}, joinerUserId)
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
        .eq('spectator', false)

      const seatsFull = game.status === 'waiting' && (playerCount ?? 0) >= maxPlayers
      const seatFullResp = seatFullGate(game as Game, seatsFull, rawJoinAsViewer, 'This room is full')
      if (seatFullResp) return seatFullResp
    }

    if (await nameTaken(id, name)) {
      return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
    }

    const { data: player, error } = await getSupabaseAdmin()
      .from('players')
      .insert({
        game_id: id,
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    if (isQuickDrawGame(gameType) && game.status === 'active' && !joinSpectator) {
      const { error: assignError } = await registerQuickDrawLateJoinPlayer(getSupabaseAdmin(), id, player.id)
      if (assignError) {
        await getSupabaseAdmin().from('players').delete().eq('id', player.id)
        return NextResponse.json({ error: assignError }, { status: 500 })
      }
    }

    if (isMafiaGame(gameType) && game.status === 'active') {
      await announceMafiaLateJoin(getSupabaseAdmin(), id, player.name)
    }

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
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

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
        name,
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
        name: claimName,
        gender: 'both',
        identity_gender: null,
        participant_id: participantId,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
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

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
        name,
        gender,
        identity_gender: identityGender,
        participant_id: null,
        spectator: joinSpectator,
      })
      .select()
      .single()

    if (playerError) return NextResponse.json({ error: internalErrorMessage('players', playerError) }, { status: 500 })

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
        country,
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

    return jsonPlayerJoin(roomMemberId, player, game as Game, {}, joinerUserId)
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
    monopolyToken: rawMonopolyTokenUpdate,
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

  // Monopoly: swap your board token from the lobby. Isolated single-field update —
  // only fires when a token is sent (name/gender edits never carry one).
  if (rawMonopolyTokenUpdate !== undefined) {
    const token = String(rawMonopolyTokenUpdate)
    if (!isMonopolyTokenId(token)) {
      return NextResponse.json({ error: 'Pick a valid token' }, { status: 400 })
    }
    const { data: gameRow } = await getSupabaseAdmin().from('games').select('status').eq('id', id).maybeSingle()
    if (gameRow?.status !== 'waiting') {
      return NextResponse.json({ error: 'Tokens lock once the game starts' }, { status: 400 })
    }
    if (player.spectator) {
      return NextResponse.json({ error: 'Watchers don’t use a board token' }, { status: 400 })
    }
    const { data: clash } = await getSupabaseAdmin()
      .from('players')
      .select('id')
      .eq('game_id', id)
      .eq('monopoly_token', token)
      .neq('id', playerId)
      .maybeSingle()
    if (clash) {
      return NextResponse.json({ error: 'That token was just taken — pick another' }, { status: 400 })
    }
    const { data: updatedPlayer, error } = await getSupabaseAdmin()
      .from('players')
      .update({ monopoly_token: token })
      .eq('id', playerId)
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That token was just taken — pick another' }, { status: 400 })
      }
      return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })
    }
    return NextResponse.json({
      playerId: updatedPlayer.id,
      playerName: updatedPlayer.name,
      playerGender: updatedPlayer.gender,
    })
  }

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
    // Capture the team before deletion — the role row is FK-cascaded away with the player.
    const { data: roleRow } = await getSupabaseAdmin()
      .from('codewords_player_roles')
      .select('team')
      .eq('game_id', id)
      .eq('player_id', playerId)
      .maybeSingle()
    const removedTeam = (roleRow?.team as 'red' | 'blue' | undefined) ?? null

    const { error } = await removeCodewordsPlayer(getSupabaseAdmin(), id, playerId)
    if (error) return NextResponse.json({ error }, { status: 500 })

    // Keep the round playable (or end it) when the departure breaks a team's roster.
    const { error: reconcileError, outcome } = await reconcileCodewordsTeamAfterRemoval(
      getSupabaseAdmin(),
      id,
      removedTeam
    )
    if (reconcileError) return NextResponse.json({ error: reconcileError }, { status: 500 })

    return NextResponse.json({ success: true, ...outcome })
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

  if (isUnoGame(gameType)) {
    const { error } = await removeUnoPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isLudoGame(gameType)) {
    const { error } = await removeLudoPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isMahjongGame(gameType)) {
    const { error } = await removeMahjongPlayer(getSupabaseAdmin(), id, playerId, player.name)
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

  if (isDraughts10Game(gameType)) {
    const { error } = await removeDraughts10Player(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isAyoGame(gameType)) {
    const { error } = await removeAyoPlayer(getSupabaseAdmin(), id, playerId, player.name)
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

  let wordRushRollback: { roster: string[]; prompt_setter_player_id: string | null } | undefined
  if (isWordRushGame(gameType)) {
    const admin = getSupabaseAdmin()
    const sync = await syncWordRushAfterPlayerRemoved(admin, id, playerId)
    if (sync.error) {
      return NextResponse.json({ error: sync.error }, { status: sync.internal ? 500 : 400 })
    }
    wordRushRollback = sync.rollback
  }

  if (game!.participant_mode === 'joiners') {
    const { error } = await deleteJoinerPair(getSupabaseAdmin(), id, player)
    if (error) {
      if (wordRushRollback) await revertWordRushRosterAfterFailedPlayerDelete(getSupabaseAdmin(), id, wordRushRollback)
      return NextResponse.json({ error: internalErrorMessage('players', { message: error }) }, { status: 500 })
    }
  } else {
    const { error } = await getSupabaseAdmin().from('players').delete().eq('id', playerId)
    if (error) {
      if (wordRushRollback) await revertWordRushRosterAfterFailedPlayerDelete(getSupabaseAdmin(), id, wordRushRollback)
      return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })
    }
  }

  if (isSudokuGame(gameType)) {
    // The leaver may have been the last player still solving — with them gone,
    // everyone remaining may already be done, and no further submission would
    // ever re-trigger the completion check. Best-effort: never block the leave.
    await finishSudokuIfAllPlayersDone(getSupabaseAdmin(), id)
  }

  if (isDescribeItGame(gameType)) {
    // A team may have dropped below the minimum to field a turn — skip it, or
    // end the match if only one team can still play. Best-effort: never block.
    await reconcileDescribeItAfterRemoval(getSupabaseAdmin(), id)
  }

  if (isQuickDrawGame(gameType)) {
    // Same team-collapse handling for Quick Draw's team mode (no-op for the
    // individual "telephone" variant, which has no guess session).
    await reconcileQuickDrawGuessAfterRemoval(getSupabaseAdmin(), id)
  }

  return NextResponse.json({ success: true })
}
