import {
  isAnonymousMessagesGame,
  isAyoGame,
  isBingoGame,
  isCheckersGame,
  isChessGame,
  isCodewordsGame,
  isCrazyEightsGame,
  isDescribeItGame,
  isICallOnGame,
  isLudoGame,
  isMahjongGame,
  isMonopolyGame,
  isQuiplashGame,
  isQuickDrawGame,
  isScrabbleGame,
  isSecretMessageGame,
  isSnakeAndLadderGame,
  isSudokuGame,
  isTicTacToeGame,
  isTriviaGame,
  isTwoTruthsGame,
  isWhotGame,
  isWordHuntGame,
  isWordRushGame,
  isYahtzeeGame,
  parseGameType,
} from './game-type-checks'
import { lobbyHasOpenPlayerSeat } from './game-limits-lite'
import {
  isMostLikelyTo,
  isNeverHaveIEver,
  isThisOrThat,
  isWouldYouRather,
} from './poll-games'
import type { Game, GameType, Player } from './types'

export type LateJoinPolicy = 'lobby_only' | 'viewers_only' | 'viewers_and_players'

export function lateJoinPolicyFromGame(game: Pick<Game, 'allow_viewers' | 'allow_late_players'>): LateJoinPolicy {
  if (game.allow_viewers === false) return 'lobby_only'
  if (game.allow_late_players === false) return 'viewers_only'
  return 'viewers_and_players'
}

export function gameSupportsViewerSetting(gameType: GameType): boolean {
  return !isSecretMessageGame(gameType)
}

export function gameAllowsLatePlayerJoin(gameType: GameType): boolean {
  return (
    !isMonopolyGame(gameType) &&
    !isYahtzeeGame(gameType) &&
    !isWhotGame(gameType) &&
    !isCrazyEightsGame(gameType) &&
    !isLudoGame(gameType) &&
    !isMahjongGame(gameType) &&
    !isSnakeAndLadderGame(gameType) &&
    !isTicTacToeGame(gameType) &&
    !isChessGame(gameType) &&
    !isCheckersGame(gameType) &&
    !isAyoGame(gameType) &&
    !isScrabbleGame(gameType)
  )
}

export function gameOffersLateJoinChoice(gameType: GameType): boolean {
  return (
    isTriviaGame(gameType) ||
    isCodewordsGame(gameType) ||
    isDescribeItGame(gameType) ||
    isWordRushGame(gameType) ||
    isBingoGame(gameType) ||
    isWordHuntGame(gameType) ||
    isWouldYouRather(gameType) ||
    isNeverHaveIEver(gameType) ||
    isThisOrThat(gameType) ||
    isMostLikelyTo(gameType) ||
    isTwoTruthsGame(gameType) ||
    isICallOnGame(gameType) ||
    isSudokuGame(gameType) ||
    isQuiplashGame(gameType) ||
    isQuickDrawGame(gameType)
  )
}

export function allowLateJoin(
  game: Pick<Game, 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): boolean {
  const gameType = parseGameType(game.game_type)
  if (!gameSupportsViewerSetting(gameType)) return false
  return game.allow_viewers !== false
}

export function allowLatePlayers(
  game: Pick<Game, 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'>
): boolean {
  if (!allowLateJoin(game)) return false
  const gameType = parseGameType(game.game_type)
  if (!gameAllowsLatePlayerJoin(gameType)) return false
  if (isCodewordsGame(gameType) && game.codewords_late_join === false) return false
  return game.allow_late_players !== false
}

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
    | 'max_players'
  >,
  players?: ReadonlyArray<Pick<Player, 'spectator'>>
): boolean {
  if (player.is_eliminated) return false
  if (game.tournament_id) return false
  if (game.status !== 'active') return false
  if (!playerIsViewer(player, game)) return false
  if (!allowLatePlayers(game)) return false
  if (players && !lobbyHasOpenPlayerSeat(game, players)) return false
  return true
}

export function lateJoinBlockedMessage(gameType: GameType): string {
  if (isCodewordsGame(gameType)) return 'This game has already started.'
  return 'This game has already started. Wait here — you can join when the host opens the lobby again.'
}

export type PreJoinScreen = 'join' | 'game_started_waiting' | 'late_join_choice' | 'game_ended'

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
