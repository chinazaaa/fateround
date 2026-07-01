import { internalErrorMessage } from '@/lib/api-errors'
import {
  isAnonymousMessagesGame,
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
  isWordHuntGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isSecretMessageGame,
  isSudokuGame,
  isThisOrThat,
  isTriviaGame,
  isTwoTruthsGame,
  isICallOnGame,
  isWouldYouRather,
  parseGameType,
} from '@/lib/game-types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, GameType, Player } from '@/types'

export type LateJoinPolicy = 'lobby_only' | 'viewers_only' | 'viewers_and_players'

export function lateJoinPolicyFromGame(game: Pick<Game, 'allow_viewers' | 'allow_late_players'>): LateJoinPolicy {
  if (game.allow_viewers === false) return 'lobby_only'
  if (game.allow_late_players === false) return 'viewers_only'
  return 'viewers_and_players'
}

export function lateJoinPolicyToFields(policy: LateJoinPolicy): {
  allow_viewers: boolean
  allow_late_players: boolean
} {
  switch (policy) {
    case 'lobby_only':
      return { allow_viewers: false, allow_late_players: false }
    case 'viewers_only':
      return { allow_viewers: true, allow_late_players: false }
    case 'viewers_and_players':
      return { allow_viewers: true, allow_late_players: true }
  }
}

/** Board games only support lobby-only or watch-only late join. */
export function clampLateJoinPolicyForGameType(policy: LateJoinPolicy, gameType: GameType): LateJoinPolicy {
  if (!gameAllowsLatePlayerJoin(gameType) && policy === 'viewers_and_players') {
    return 'viewers_only'
  }
  return policy
}

/** Host can toggle late join policy (excludes secret message). */
export function gameSupportsViewerSetting(gameType: GameType): boolean {
  return !isSecretMessageGame(gameType)
}

/** Board games allow watch-only late join — not mid-game players. */
export function gameAllowsLatePlayerJoin(gameType: GameType): boolean {
  return (
    !isMonopolyGame(gameType) &&
    !isYahtzeeGame(gameType) &&
    !isWhotGame(gameType) &&
    !isCrazyEightsGame(gameType) &&
    !isLudoGame(gameType) &&
    !isSnakeAndLadderGame(gameType) &&
    !isTicTacToeGame(gameType) &&
    !isChessGame(gameType) &&
    !isCheckersGame(gameType) &&
    !isScrabbleGame(gameType)
  )
}

/** Round/lobby games: late joiners pick viewer vs player. */
export function gameOffersLateJoinChoice(gameType: GameType): boolean {
  return (
    isTriviaGame(gameType) ||
    isCodewordsGame(gameType) ||
    isDescribeItGame(gameType) ||
    isBingoGame(gameType) ||
    isWordHuntGame(gameType) ||
    isWouldYouRather(gameType) ||
    isNeverHaveIEver(gameType) ||
    isThisOrThat(gameType) ||
    isMostLikelyTo(gameType) ||
    isTwoTruthsGame(gameType) ||
    isICallOnGame(gameType) ||
    isSudokuGame(gameType)
  )
}

/** Whether late joiners may enter while the game is active (watch and/or play). */
export function allowLateJoin(
  game: Pick<Game, 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): boolean {
  const gameType = parseGameType(game.game_type)
  if (!gameSupportsViewerSetting(gameType)) return false
  return game.allow_viewers !== false
}

/** Whether late joiners may join as active players (not just spectators). */
export function allowLatePlayers(
  game: Pick<Game, 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): boolean {
  if (!allowLateJoin(game)) return false
  const gameType = parseGameType(game.game_type)
  if (!gameAllowsLatePlayerJoin(gameType)) return false
  if (isCodewordsGame(gameType) && game.codewords_late_join === false) return false
  return game.allow_late_players !== false
}

/** @deprecated Use allowLateJoin */
export function allowViewers(
  game: Pick<Game, 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): boolean {
  return allowLateJoin(game)
}

/** True when the player is watching read-only (not participating). */
export function playerIsViewer(
  player: Pick<Player, 'joined_at' | 'spectator' | 'is_eliminated'>,
  game: Pick<Game, 'status' | 'session_started_at'>
): boolean {
  if (player.is_eliminated) return true
  if (player.spectator === true) return true
  if (player.spectator === false) return false
  if (game.status !== 'active') return false
  if (!game.session_started_at) return false
  return new Date(player.joined_at).getTime() >= new Date(game.session_started_at).getTime()
}

export function playerCanParticipate(
  player: Pick<Player, 'joined_at' | 'spectator' | 'is_eliminated'>,
  game: Pick<Game, 'status' | 'session_started_at'>
): boolean {
  return !playerIsViewer(player, game)
}

/** True when a spectator can switch to an active player mid-game. */
export function canSwitchViewerToPlayer(
  player: Pick<Player, 'joined_at' | 'spectator' | 'is_eliminated'>,
  game: Pick<
    Game,
    | 'status'
    | 'session_started_at'
    | 'allow_viewers'
    | 'allow_late_players'
    | 'codewords_late_join'
    | 'game_type'
    | 'tournament_id'
  >
): boolean {
  if (player.is_eliminated) return false
  // Tournament rosters lock when the first game starts — watchers and eliminated
  // players follow as spectators and can never switch into the game.
  if (game.tournament_id) return false
  if (game.status !== 'active') return false
  if (!playerIsViewer(player, game)) return false
  return allowLatePlayers(game)
}

export function lateJoinBlockedMessage(gameType: GameType): string {
  if (isCodewordsGame(gameType)) return 'This game has already started.'
  return 'This game has already started. Wait here — you can join when the host opens the lobby again.'
}

export type PreJoinScreen = 'join' | 'game_started_waiting' | 'late_join_choice' | 'game_ended'

/** Screen for someone who has not joined yet (no player row / session). */
export function preJoinScreen(
  game: Pick<Game, 'status' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>,
  hasPlayer: boolean
): PreJoinScreen | null {
  if (hasPlayer) return null
  if (game.status === 'finished') return 'game_ended'
  if (game.status === 'waiting') return 'join'
  if (game.status === 'active') {
    if (!allowLateJoin(game)) return 'game_started_waiting'
    const gameType = parseGameType(game.game_type)
    if (gameOffersLateJoinChoice(gameType) && allowLateJoin(game)) return 'late_join_choice'
    return 'join'
  }
  return 'join'
}

export function canJoinGame(
  game: Pick<Game, 'status' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): { ok: true } | { ok: false; error: string } {
  const gameType = parseGameType(game.game_type)
  if (game.status === 'finished') {
    return { ok: false, error: 'This game has ended' }
  }
  if (game.status === 'waiting') return { ok: true }
  if (game.status === 'active') {
    if (allowLateJoin(game)) return { ok: true }
    return { ok: false, error: lateJoinBlockedMessage(gameType) }
  }
  return { ok: false, error: 'Cannot join this game' }
}

/** Spectator flag for a new player row during an active game. */
export function spectatorForActiveJoin(
  game: Pick<Game, 'status' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>,
  joinAsViewer: boolean | undefined
): boolean {
  if (game.status !== 'active') return false
  const gameType = parseGameType(game.game_type)
  if (isAnonymousMessagesGame(gameType)) return true
  if (isMonopolyGame(gameType) || isYahtzeeGame(gameType) || isWhotGame(gameType) || isCrazyEightsGame(gameType))
    return true
  if (!allowLatePlayers(game)) return true
  if (gameOffersLateJoinChoice(gameType)) return joinAsViewer === true
  return joinAsViewer === true
}

/** Mark existing players as spectators when the lobby reopens so they must opt in. */
export async function resetSpectatorsForLobby(
  supabase: SupabaseClient,
  gameId: string,
  exceptPlayerIds: string[] = []
): Promise<{ error: string | null }> {
  const { error: resetError } = await supabase.from('players').update({ spectator: true }).eq('game_id', gameId)
  if (resetError) return { error: internalErrorMessage('viewers', resetError) }

  if (exceptPlayerIds.length === 0) return { error: null }

  const { error: readyError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .in('id', exceptPlayerIds)

  return { error: readyError?.message ?? null }
}
