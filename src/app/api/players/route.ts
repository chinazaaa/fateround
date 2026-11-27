import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { createPlayerSchema, updatePlayerSchema, deletePlayerSchema } from '@/lib/validation'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { completeHostLeftCleanup } from '@/lib/admin-end-game'
import { runPostFinishBookkeeping } from '@/lib/game-finish'
import { internalErrorMessage } from '@/lib/api-errors'
import { normalizeGender, normalizePlayerGender, type ParticipantGender } from '@/lib/participants'
import { generateResumeToken, normalizeResumeToken } from '@/lib/utils'
import { removeMonopolyPlayer } from '@/lib/monopoly'
import { removeScrabblePlayer } from '@/lib/scrabble'
import { removeWhotPlayer } from '@/lib/whot'
import { removeCrazyEightsPlayer } from '@/lib/crazy-eights'
import { removeRummyPlayer } from '@/lib/rummy'
import { completePendingFinishedLeave } from '@/lib/pending-leave'
import { recoverFinishBookkeeping } from '@/lib/game-finish'
import { removeGoFishPlayer } from '@/lib/gofish-server'
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
  reconcileCodewordsAllTeams,
  removeCodewordsPlayer,
  removePlayerIfGameOpen,
} from '@/lib/codewords'
import { assignDescribeItLateJoinTeam, reconcileDescribeItAfterRemoval } from '@/lib/describe-it'
import { registerQuickDrawLateJoinPlayer } from '@/lib/quick-draw'
import { reconcileQuickDrawGuessAfterRemoval } from '@/lib/quick-draw-guess'
import {
  assignWordRushLateJoinTeam,
  revertWordRushRosterAfterFailedPlayerDelete,
  syncWordRushAfterPlayerRemoved,
  type WordRushRosterSnapshot,
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
  isRummyGame,
  isUnoGame,
  isGoFishGame,
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
  assertHostWith,
  assertPlayer,
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

async function assertPlayerSessionGame(gameCode: string, { allowFinishedLeave = false } = {}) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase
    .from('games')
    .select('status, participant_mode, game_type, custom_slots, gender_based, max_players')
    .eq('id', id)
    .maybeSingle()

  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }

  const gameType = parseGameType(game.game_type)
  if (isCodewordsGame(gameType)) {
    // A leave of a finished room is let through (the finished-game branch retains the seat, like every other game):
    // a host-left finish re-runs its pending cleanup on the retained host's next leave.
    if (!codewordsAllowsPlayerChanges(game.status) && !(allowFinishedLeave && game.status === 'finished')) {
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
  // A host_token that matches the game's own host_token proves the caller IS
  // the host device (SecureStore holds it only on that device). Without this
  // shortcut the host would hit the cross-device 409 when playing along in
  // their own lobby, because host_user_id is set to their own auth uid.
  const suppliedHostToken = body.hostToken?.trim() || null
  const gameHostToken = (gameRow as { host_token?: string | null }).host_token ?? null
  const callerIsHostDevice = !!suppliedHostToken && !!gameHostToken && suppliedHostToken === gameHostToken
  if (joinerUserId) {
    const hostUserId = (gameRow as { host_user_id?: string | null }).host_user_id ?? null
    if (hostUserId && hostUserId === joinerUserId && !continueOnThisDevice && !callerIsHostDevice) {
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

    // An explicit viewer join is inserted as spectator and consumes no participant seat, so a
    // full lobby only turns away joins that would take one.
    if (gameRow.status === 'waiting' && (playerCount ?? 0) >= maxPlayers && rawJoinAsViewer !== true) {
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
        // An explicit watch-only join stays a spectator even while the room is still in the lobby.
        spectator: rawJoinAsViewer === true || spectatorForActiveJoin(gameRow as Game, true),
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

/**
 * DELETE is a removal followed by ONE database call that settles the host handoff.
 *
 * `settle_host_leave` (migration 20261203900000) locks the game row and, against the CURRENT row and roster, decides
 * everything that used to be a chain of separate statements: whether the leaver's seat is really gone (a retained
 * finisher keeps it and stays host), a nominee who still exists, a different host, a finished game, the oldest
 * eligible successor, or ending the game when there is none. Nothing about the handoff is written before the removal,
 * so a failed or conflicting leave has nothing to roll back, and there is no interleaving left between "read" and
 * "write" for a start, replay, claim or another leave to land in.
 *
 * Recovery limit, stated plainly: once the seat is deleted the leaver's resume token no longer resolves, so a second
 * DELETE cannot re-run this. If the call cannot be reached the handoff is UNRESOLVED: the response says so (it does
 * not claim a retry works) and the game keeps no nominee until it is settled by hand (a manual host transfer) or ended
 * by the idle reaper, which finishes any non-inbox active game whose last_activity_at is older than the idle
 * threshold regardless of who hosts it (src/lib/idle-reaper.ts) and the stale-lobby cron for waiting games.
 */
export async function DELETE(req: NextRequest) {
  const ctx: { handoff: HostHandoff | null; seatMayBeRemoved: boolean; seatRetained: boolean } = {
    handoff: null,
    seatMayBeRemoved: false,
    seatRetained: false,
  }
  const res = await removePlayer(req, ctx)
  if (!ctx.handoff) return res
  const settled = await settleHostLeave(ctx.handoff, res.status < 400)
  if (settled === 'ok') return res
  if (res.status >= 400) {
    // The removal's own failure is what the caller sees. If it had ALREADY deleted the seat (Codewords deletes the seat,
    // then its team reconcile can fail), the handoff is unresolved too, and the response says so alongside the original
    // error; if the seat is still there, the removal error stands alone and the leave can simply be repeated.
    if (settled !== 'unresolved') return res
    // Whether the seat may be gone is known for the paths that track it. Every other per-game removal only reports an
    // error, and a delete whose response was lost can still have committed, so read the seat back: only a seat that is
    // verifiably still there leaves the error standing alone (the leave can be repeated); a missing or unreadable seat
    // means the old resume token cannot retry and the handoff is unresolved.
    if (!ctx.seatMayBeRemoved && (await seatPresence(ctx.handoff.gameId, ctx.handoff.playerId)) === 'present')
      return res
    const original = (await res
      .clone()
      .json()
      .catch(() => ({}))) as Record<string, unknown>
    // The original status and details stay (`removalError` carries the removal's own message); its retry advice goes:
    // the seat may be gone, so the resume token may no longer authenticate a repeat.
    return NextResponse.json(
      {
        ...original,
        error:
          'Leaving the game may or may not have completed (the outcome of removing your seat is unknown) and the host handoff could not be completed. Repeating the leave may not work.',
        removalError: original.error,
        handoff: 'unresolved',
      },
      { status: res.status }
    )
  }
  if (settled === 'retained_clear_failed' || ctx.seatRetained) {
    // The seat is KNOWN to still exist (a retained leave): the resume token still works, so this one really can be
    // repeated, and nothing is claimed about the handoff beyond that.
    return NextResponse.json({ error: 'Could not finish leaving the game — try again' }, { status: 500 })
  }
  return NextResponse.json(
    {
      error:
        'You left the game, but the host handoff could not be completed. The game may be without a host until another player is made host or it ends when idle.',
      handoff: 'unresolved',
    },
    { status: 500 }
  )
}

/** Whether a player's seat still exists (`unknown` when it cannot be read). */
async function seatPresence(gameId: string, playerId: string): Promise<'present' | 'absent' | 'unknown'> {
  const { data, error } = await getSupabaseAdmin()
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (error) return 'unknown'
  return data ? 'present' : 'absent'
}

/** The host linkage and session captured BEFORE the leave writes anything (the seat delete nulls host_player_id). */
type HostHandoff = {
  gameId: string
  gameType: string
  playerId: string
  hostUserId: string | null
  /** The session the leave inspected (used to bind the host-left finish and every linkage clear to it). */
  session: { startedAt: string | null; sessionsPlayed: number | null }
}

type SettleOutcome = {
  status: 'game_missing' | 'seat_retained' | 'finished' | 'nominated' | 'settled'
  game_status?: string
  finished_now?: boolean
  finished_at?: string
  session_changed?: boolean
}

const SETTLE_ATTEMPTS = 3

/**
 * Settle the host handoff once the removal has run. Returns 'ok', 'retained_clear_failed' (the seat is retained and
 * the linkage clear failed: repeatable, the seat still exists) or 'unresolved' (the database call could not be
 * reached after the seat was gone). The RPC is idempotent, so retrying the CALL on a transport error is safe.
 */
async function settleHostLeave(
  h: HostHandoff,
  leaveSucceeded: boolean
): Promise<'ok' | 'retained_clear_failed' | 'unresolved'> {
  const admin = getSupabaseAdmin()
  let outcome: SettleOutcome | null = null
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !outcome; attempt++) {
    const { data, error } = await admin.rpc('settle_host_leave', {
      p_game_id: h.gameId,
      p_outgoing_player_id: h.playerId,
      p_outgoing_host_user_id: h.hostUserId,
      p_session_started_at: h.session.startedAt,
      p_sessions_played: h.session.sessionsPlayed,
      p_track_bookkeeping: isWordRushGame(parseGameType(h.gameType)),
    })
    if (!error && data) outcome = data as SettleOutcome
  }
  if (!outcome) {
    console.error(`players: host handoff for ${h.gameId} is unresolved (settle_host_leave unreachable)`)
    return 'unresolved'
  }

  if (outcome.status === 'seat_retained') {
    // The seat was kept (a finisher's row): they never stopped being the host, so nobody is nominated. Only a
    // SUCCESSFUL retained leave of a game that is finished routes them away, and only while the game still
    // references this seat and this session; a failed removal (the seat still exists) clears nothing.
    if (leaveSucceeded && outcome.game_status === 'finished' && h.hostUserId) {
      let clear = admin
        .from('games')
        .update({ host_user_id: null })
        .eq('id', h.gameId)
        .eq('host_user_id', h.hostUserId)
        .eq('host_player_id', h.playerId)
      clear =
        h.session.sessionsPlayed === null
          ? clear.is('sessions_played', null)
          : clear.eq('sessions_played', h.session.sessionsPlayed)
      clear =
        h.session.startedAt === null
          ? clear.is('session_started_at', null)
          : clear.eq('session_started_at', h.session.startedAt)
      const { error } = await clear
      if (error) {
        console.error('players: clearing host_user_id after a retained host leave failed', error)
        return 'retained_clear_failed'
      }
    }
    return 'ok'
  }

  if (outcome.status === 'finished') {
    // The finish THIS call committed owes the bookkeeping every finish owes (room points, round facts, tournament work),
    // exactly as `markGameFinished` would have run it. The session-bound cleanup is idempotent and runs for whoever
    // finished it.
    if (outcome.finished_now && outcome.finished_at) await runHostLeftBookkeeping(admin, h, outcome.finished_at)
    // A finish the settlement only OBSERVED (it did not commit it) under a changed session is another session's finish:
    // this stale leave has no business closing its rounds or wiping its chat, whatever timestamp it carries. A finish the
    // settlement itself committed (after a same-generation Start) is this leave's own.
    const cleanup =
      !outcome.finished_now && outcome.session_changed
        ? { finished: true, error: null }
        : // Bound to the finish the settlement observed, never to whichever finish the game has by the time this runs.
          await completeHostLeftCleanup(admin, h.gameId, { finishedAt: outcome.finished_at })
    // The seat is gone, so a failed cleanup has no later leave to retry it: surface it for an operator.
    if (cleanup.error) console.error(`players: cleanup after host-left finish failed for ${h.gameId}`, cleanup.error)
  }
  return 'ok'
}

/**
 * The post-finish bookkeeping for a finish committed by the database function, run the way `markGameFinished` runs it
 * for any other finish (Word Rush: under its durable lease, the marker having been written by the finishing statement;
 * every other game: the side effects inline, best-effort). Never throws.
 */
async function runHostLeftBookkeeping(admin: ReturnType<typeof getSupabaseAdmin>, h: HostHandoff, finishedAt: string) {
  try {
    await runPostFinishBookkeeping(admin, h.gameId, finishedAt, isWordRushGame(parseGameType(h.gameType)))
  } catch (err) {
    console.error(`players: post-finish bookkeeping after the host-left finish failed for ${h.gameId}`, err)
  }
}

/**
 * A host who leaves while nobody else is eligible ends the game BEFORE the removal, so the finished game keeps their
 * seat. `end_game_if_host_alone` reads the roster and finishes under FOR UPDATE on the game row (a join holds KEY SHARE
 * on it through its foreign key, so a joiner either is seen or waits), bound to the session the leave inspected, with
 * `host_ended` (and, for Word Rush, its bookkeeping marker) written by the same UPDATE. Returns 'finished' (including a repeat after a
 * lost response), 'continue' (remove the seat and settle the handoff against the current row) or 'error'.
 */
async function endGameIfHostAlone(h: HostHandoff): Promise<'finished' | 'closed' | 'continue' | 'error'> {
  const admin = getSupabaseAdmin()
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const { data, error } = await admin.rpc('end_game_if_host_alone', {
      p_game_id: h.gameId,
      p_outgoing_player_id: h.playerId,
      p_session_started_at: h.session.startedAt,
      p_sessions_played: h.session.sessionsPlayed,
      p_track_bookkeeping: isWordRushGame(parseGameType(h.gameType)),
    })
    if (error || !data) continue
    const { status, finished_now, finished_at } = data as {
      status?: string
      finished_now?: boolean
      finished_at?: string
    }
    if (status === 'finished') {
      // A 'finished' answer falls into the finished-game branch, which cleans up; this call's own finish owes its bookkeeping.
      if (finished_now && finished_at) await runHostLeftBookkeeping(admin, h, finished_at)
      return 'finished'
    }
    // Finished for another reason (read under the lock): the host's seat belongs to a result and must not be removed.
    return (data as { game_status?: string }).game_status === 'finished' ? 'closed' : 'continue'
  }
  return 'error'
}

/**
 * The seat removal found the leaving host alone and FINISHED the game instead of deleting the seat (one locked check in
 * remove_player_if_game_open): this owes the finish what any host-left finish owes (its bookkeeping and the session-bound
 * cleanup), bound to the finish the database just wrote.
 */
async function completeHostEndedByRemoval(h: HostHandoff | null, gameId: string, finishedAt: string) {
  const admin = getSupabaseAdmin()
  if (h) await runHostLeftBookkeeping(admin, h, finishedAt)
  const cleanup = await completeHostLeftCleanup(admin, gameId, { finishedAt })
  if (cleanup.error) console.error(`players: cleanup after host-left finish failed for ${gameId}`, cleanup.error)
}

/** A leave of a finished game keeps the seat (the result stays intact); the leaver just stops being pushed to. */
async function retainedLeaveResponse(ctx: { seatRetained: boolean }, gameId: string, playerId: string) {
  await Promise.all([
    getSupabaseAdmin().from('push_subscriptions').delete().eq('game_id', gameId).eq('player_id', playerId),
    getSupabaseAdmin().from('mobile_push_tokens').delete().eq('game_id', gameId).eq('player_id', playerId),
  ]).catch(() => {})
  // The seat stays and still names the host: DELETE routes them away only after this successful retained leave.
  ctx.seatRetained = true
  return NextResponse.json({ success: true, retained: true })
}

async function removePlayer(
  req: NextRequest,
  ctx: { handoff: HostHandoff | null; seatMayBeRemoved: boolean; seatRetained: boolean }
) {
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
      // A finished game is let through for the forfeit-cleanup engines only: a host removal that
      // finished the game and then failed to delete the seat must be repeatable, so the finished-game
      // guard below can run `completePendingFinishedLeave` (retained vs pending cleanup). Every other
      // game type keeps the 400 for a finished game.
      const removeStatusError = 'Players can only be removed while the lobby or game is open'
      const hostGameType = parseGameType(hostGame.game_type)
      const forfeitCleanup =
        isRummyGame(hostGameType) ||
        isWhotGame(hostGameType) ||
        isChessGame(hostGameType) ||
        isCheckersGame(hostGameType) ||
        isDraughts10Game(hostGameType)
      const auth = await assertHostWith(getSupabaseAdmin(), gameCode, hostToken, {
        allowedStatuses: forfeitCleanup ? ['waiting', 'active', 'finished'] : ['waiting', 'active'],
        statusError: removeStatusError,
      })
      if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
      game = auth.game
      id = auth.id
    }
  } else {
    const session = await assertPlayerSessionGame(gameCode, { allowFinishedLeave: true })
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

  if (!player) {
    // A host repeating a removal whose reconciliation gave up ("try again") finds the player already
    // deleted and can no longer name the team they left: reconcile every team so the repair finishes.
    if (hostToken && isCodewordsGame(parseGameType((game as { game_type?: string } | null)?.game_type))) {
      const repair = await reconcileCodewordsAllTeams(getSupabaseAdmin(), id)
      if (repair.error) return NextResponse.json({ error: repair.error }, { status: 500 })
      if (repair.outcome.ended || repair.outcome.promotedPlayerId) {
        return NextResponse.json({ success: true, ...repair.outcome })
      }
    }
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  /**
   * Host self-leave on a live game.
   *
   * Only fires when a non-host caller (no hostToken presented) is leaving their own seat,
   * AND that seat happens to be the current host_player_id. Everyone else's leave falls
   * straight through to the per-game-type removal.
   *
   *   * Pending nomination already set → the nominee's HostNominationBanner is live and
   *     their /claim-host path still works; just null out host_user_id so the outgoing
   *     host's cross-device Continue stops routing them back to /host/[code].
   *
   *   * No pending nomination and at least one non-bot, non-spectator player remains →
   *     auto-nominate the oldest of them (joined_at ASC). Their banner fires and the
   *     same claim path an explicit transfer uses hands off host_token cleanly. Avoids
   *     the orphaned-host state where nobody can advance turns.
   *
   *   * No pending nomination and no eligible successor → end the game via adminEndGame
   *     with result_reason='host_ended'. Same shape as the idle reaper's abandoned-game
   *     handling. The finished-game branch below then retains the leaving player's row
   *     for leaderboard integrity.
   */
  let leavingHost: HostHandoff | null = null
  if (!hostToken) {
    const { data: gameRow } = await getSupabaseAdmin()
      .from('games')
      .select(
        'status, game_type, host_player_id, host_user_id, pending_host_player_id, session_started_at, sessions_played'
      )
      .eq('id', id)
      .maybeSingle()
    // This read is newer than the one that authorised the leave: a finish that landed in between must be seen.
    // (Whatever it says: a Codewords room reopened by Play Again in between must take the removal path, not the retained one.)
    if (gameRow?.status) (game as { status?: string }).status = gameRow.status
    if (gameRow && gameRow.host_player_id === playerId) {
      leavingHost = {
        gameId: id,
        gameType: gameRow.game_type,
        playerId,
        hostUserId: gameRow.host_user_id ?? null,
        session: { startedAt: gameRow.session_started_at ?? null, sessionsPlayed: gameRow.sessions_played ?? null },
      }
      // Also with a pending nominee: the database counts a nominee only while it is eligible (a spectator is no successor).
      if (gameRow.status === 'waiting' || gameRow.status === 'active') {
        const ended = await endGameIfHostAlone(leavingHost)
        // Nothing is removed yet: a failed end must not fall through and delete the host from a live game.
        if (ended === 'error') {
          return NextResponse.json({ error: 'Could not end the game — try again' }, { status: 500 })
        }
        if (ended === 'finished' || ended === 'closed') (game as { status?: string }).status = 'finished'
      }
      // Whoever follows is chosen only after the seat is verifiably gone, in one database call (see DELETE).
      ctx.handoff = leavingHost
    }
  }

  /**
   * A finished game is a RESULT, and a result does not change because someone closed the tab.
   *
   * Leaving hard-DELETEs the players row, and the per-game score tables cascade off it
   * (`trivia_answers.player_id references players(id) on delete cascade`, and the same shape
   * everywhere else). Every finished screen ranks the rows that are still there and highlights
   * the top one — so when the players above you left the results screen, their scores were
   * ERASED and you were promoted into first. Reported as "I was 5th, the top four left, and the
   * finished screen made me the winner".
   *
   * It was never only cosmetic. `GameFinishPanel` derives `winnerPlayerId` the same way and
   * `PostWinToCommunity` fires on it, so a phantom win was posted to the community leaderboard;
   * the award pass takes its winners from the same place.
   *
   * So: once a game is over, removal is a no-op. There is nothing left to leave — the client
   * clears its local session and navigates away either way, which is why this answers 200
   * rather than an error. Mid-game departures still delete, and that stays correct: a player
   * who walks out before the end forfeits rather than placing.
   *
   * Placed BEFORE the per-game branches deliberately: each of those runs its own removal and
   * returns early, so a guard any lower would miss most of the games.
   */
  if ((game as { status?: string }).status === 'finished') {
    /**
     * Exception: a forfeiting leave (Rummy, Whot, Chess, Checkers, Draughts10) commits the finished
     * session before it deletes the leaver's seat; if that cleanup failed, the leaver is gone from
     * the session but still holds a seat. A repeat leave must finish the cleanup rather than be
     * answered "retained". Finishers and spectators leave no such trace and fall through below.
     */
    // A host-left finish writes its reason and `finished_at` in the finish itself, but finishes the game BEFORE the
    // session's leftovers (rounds, Two Truths reveal, chat / message wipes) are cleaned up. If that cleanup (or
    // the response that carried the finish) was lost, the game can no longer be ended again, so every leave of
    // the retained host seat re-runs it, bound to the finished session.
    if (leavingHost) {
      // No finish was observed from a database answer here: the captured session identity binds it (a replay that
      // ended again since belongs to a later leave).
      const cleanup = await completeHostLeftCleanup(getSupabaseAdmin(), id, { session: leavingHost.session })
      if (cleanup.error) return NextResponse.json({ error: cleanup.error }, { status: 500 })
    }
    const pending = await completePendingFinishedLeave(
      getSupabaseAdmin(),
      (game as { game_type?: string }).game_type,
      id,
      playerId,
      player.name
    )
    if (pending) {
      if (pending.error) {
        // An error AFTER the seat delete was issued is uncertain (the delete may have committed); one before it is not.
        if (pending.deleteAttempted) ctx.seatMayBeRemoved = true
        return NextResponse.json({ error: pending.error }, { status: pending.status })
      }
      // The seat is deleted: DELETE settles the departed host's linkage (settle_host_leave sees the finished game).
      return NextResponse.json({ success: true })
    }
    /**
     * Keep the row, but honour the leave in the one way that still has meaning: stop pushing
     * to them about this game.
     *
     * Both push tables key on `players(id) ON DELETE CASCADE`, so before this guard existed a
     * leave unsubscribed the device as a side effect of the delete. Retaining the row retains
     * those rows too — which would have left someone who deliberately left a finished game
     * still receiving "Play again? 🔁" when the host reopened the lobby. Unsubscribing here
     * costs the standings nothing: the score tables hang off the player row, not these.
     *
     * Best-effort: a failure to unsubscribe must not turn a successful leave into an error.
     */
    return retainedLeaveResponse(ctx, id, playerId)
  }

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

    // From here the seat MAY be gone: a delete whose response is lost can still have committed, so only a definite
    // "not deleted" answer clears this. A later failure (the team reconcile, or the delete's own error) must not hide an
    // unresolved handoff, and nothing may imply a retry works unless the seat is known to remain.
    ctx.seatMayBeRemoved = true
    const { error, gameFinished, hostEnded } = await removeCodewordsPlayer(
      getSupabaseAdmin(),
      id,
      playerId,
      ctx.handoff ? { session: ctx.handoff.session, trackBookkeeping: false } : undefined
    )
    if (hostEnded) await completeHostEndedByRemoval(ctx.handoff, id, hostEnded.finishedAt)
    // The game finished after this request read it: the seat belongs to a result and was NOT deleted (a definite answer).
    if (!error && gameFinished) {
      ctx.seatMayBeRemoved = false
      return retainedLeaveResponse(ctx, id, playerId)
    }
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
    const { error, retained } = await removeWhotPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    if (retained) ctx.seatRetained = true
    return NextResponse.json({ success: true })
  }

  if (isGoFishGame(gameType)) {
    const { error } = await removeGoFishPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCrazyEightsGame(gameType)) {
    const { error, retained } = await removeCrazyEightsPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    // A finisher's seat is kept (their placement is locked): a failed handoff afterwards is a retryable leave.
    if (retained) ctx.seatRetained = true
    return NextResponse.json({ success: true })
  }

  if (isRummyGame(gameType)) {
    const { error, conflict } = await removeRummyPlayer(getSupabaseAdmin(), id, playerId, player.name)
    // A lost race / deadlock after retries is retryable: repeating the leave completes it.
    if (error) return NextResponse.json({ error }, { status: conflict ? 409 : 500 })
    return NextResponse.json({ success: true })
  }

  if (isUnoGame(gameType)) {
    const { error, retained } = await removeUnoPlayer(getSupabaseAdmin(), id, playerId, player.name)
    if (error) return NextResponse.json({ error }, { status: 500 })
    if (retained) ctx.seatRetained = true
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

  let wordRushRollback: WordRushRosterSnapshot | undefined
  // Set when THIS leave ended the game (the last unanswered player leaving ends the last round): the seat is then
  // deleted from that finished game, bound to the session the removal reconciled, and the roster is not reverted.
  let ownFinish: { startedAt: string | null; sessionsPlayed: number | null } | undefined
  // The game session the roster reconciliation was decided against: the seat delete is bound to it, so a replay or a
  // start that lands in between is reconciled again instead of deleting a seat out of an unreconciled session.
  let expectedSession: { startedAt: string | null; sessionsPlayed: number | null } | undefined
  // Reconcile the Word Rush roster for this removal against the CURRENT game; null on success, else the response.
  const syncWordRush = async (): Promise<NextResponse | null> => {
    const admin = getSupabaseAdmin()
    const { data: before, error: beforeError } = await admin
      .from('games')
      .select('session_started_at, sessions_played')
      .eq('id', id)
      .maybeSingle()
    // Nothing has changed yet: a failed read leaves the seat and the roster as they are, so the leave can be repeated.
    if (beforeError || !before) {
      return NextResponse.json({ error: 'Could not finish leaving the game — try again' }, { status: 500 })
    }
    const sync = await syncWordRushAfterPlayerRemoved(admin, id, playerId)
    if (sync.error) {
      return NextResponse.json({ error: sync.error }, { status: sync.internal ? 500 : 400 })
    }
    // A retry's sync may find the player already off the roster (no new rollback): the earlier one still describes this
    // player's roster change and is bound to the session it was made on.
    wordRushRollback = sync.rollback ?? wordRushRollback
    // The identity comes from the reconciliation's own read of the game (not the earlier read above, which a start or a
    // replay may have outdated), so a finish it won is paired with the session it really finished.
    expectedSession = sync.gameSession ?? {
      startedAt: before.session_started_at ?? null,
      sessionsPlayed: before.sessions_played ?? null,
    }
    ownFinish = sync.ownFinish ? expectedSession : undefined
    return null
  }
  if (isWordRushGame(gameType)) {
    const failed = await syncWordRush()
    if (failed) return failed
  }

  {
    ctx.seatMayBeRemoved = true
    // Joiners mode removes the participant row together with the seat, in the same database transaction.
    const removeOnce = () =>
      removePlayerIfGameOpen(
        getSupabaseAdmin(),
        id,
        playerId,
        ownFinish,
        game!.participant_mode === 'joiners' ? player.name : undefined,
        expectedSession,
        // The host leaving: if nobody else is eligible the database finishes the game and keeps the seat, in the same
        // locked check that would delete it.
        ctx.handoff ? { session: ctx.handoff.session, trackBookkeeping: isWordRushGame(gameType) } : undefined
      )
    let removal = await removeOnce()
    // An own finish is refused while its bookkeeping marker is owed (the deletion is recorded for this exact seat and
    // finish). Complete the bookkeeping here if its lease is free, then retry once: usually the marker clears now.
    if (ownFinish && removal.gameFinished && !removal.error) {
      const owed = await recoverFinishBookkeeping(getSupabaseAdmin(), id).catch(() => ({ state: 'error' as const }))
      if (owed.state === 'none' || owed.state === 'done') removal = await removeOnce()
    }
    // The game was replayed (or started) after the roster was reconciled: reconcile the CURRENT session, then retry.
    for (let attempt = 0; removal.sessionChanged && attempt < 2; attempt++) {
      const failed = await syncWordRush()
      if (failed) return failed
      removal = await removeOnce()
    }
    if (removal.sessionChanged) {
      return NextResponse.json({ error: 'The game changed while you were leaving — try again' }, { status: 500 })
    }
    if (removal.hostEnded) await completeHostEndedByRemoval(ctx.handoff, id, removal.hostEnded.finishedAt)
    let seat: 'deleted' | 'retained' | 'unknown' = 'deleted'
    // Word Rush: the roster change made for this removal is put back by ONE database step that also decides, under the
    // games + session row locks, whether the seat survived (`restored`), was deleted (`no_seat`: nothing to restore),
    // or the session was replaced (`not_current_session`). It is the arbiter wherever the delete's outcome is not a
    // plain success, so a lost response or an unreadable read-back can never strand a seated player off the roster.
    const restoreRoster = () => revertWordRushRosterAfterFailedPlayerDelete(getSupabaseAdmin(), id, wordRushRollback!)
    let restored: Awaited<ReturnType<typeof restoreRoster>> | null = null
    if (removal.error) {
      if (wordRushRollback) {
        restored = await restoreRoster()
        if (restored === 'restored') seat = 'retained'
        else if (restored === 'no_seat') seat = 'deleted'
        else seat = 'unknown'
      }
      if (!wordRushRollback || restored === 'not_current_session' || restored === 'failed') {
        // After a delete that reported an error, only a read-back tells "rejected" from "committed, response lost".
        const presence = await seatPresence(id, playerId)
        seat = presence === 'present' ? 'retained' : presence === 'absent' ? 'deleted' : 'unknown'
      }
    } else if (removal.gameFinished) {
      seat = 'retained'
      if (wordRushRollback) {
        restored = await restoreRoster()
        // Another removal deleted the seat in the meantime: it is gone, not retained.
        if (restored === 'no_seat') seat = 'deleted'
        // The session was replaced, which the restore reports before it looks at the seat: read the seat itself.
        if (restored === 'not_current_session') {
          const presence = await seatPresence(id, playerId)
          seat = presence === 'present' ? 'retained' : presence === 'absent' ? 'deleted' : 'unknown'
        }
        // The seat stayed but the roster could not be put back: not a completed leave (a repeat goes through the
        // finished-game branch, which does not compensate), so say so instead of answering success.
        if (restored === 'failed') {
          return NextResponse.json(
            { error: 'Could not finish leaving the game: your place in the round could not be restored.' },
            { status: 500 }
          )
        }
      }
    }
    if (seat === 'retained') ctx.seatMayBeRemoved = false
    if (seat !== 'deleted') {
      if (removal.error) return NextResponse.json({ error: removal.error }, { status: 500 })
      // The guarded delete refused, but whether the seat still exists could not be confirmed: neither retained nor gone.
      if (seat === 'unknown') {
        return NextResponse.json({ error: 'Could not confirm that you left the game' }, { status: 500 })
      }
      return retainedLeaveResponse(ctx, id, playerId)
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
    // end the match if only one team can still play. Best-effort: never block —
    // the player row is already deleted, so a throw here would report failure for
    // a leave that happened.
    try {
      await reconcileDescribeItAfterRemoval(getSupabaseAdmin(), id)
    } catch (err) {
      console.error('[describe-it:reconcileAfterRemoval]', id, err)
    }
  }

  if (isQuickDrawGame(gameType)) {
    // Same team-collapse handling for Quick Draw's team mode (no-op for the
    // individual "telephone" variant, which has no guess session).
    await reconcileQuickDrawGuessAfterRemoval(getSupabaseAdmin(), id)
  }

  return NextResponse.json({ success: true })
}
