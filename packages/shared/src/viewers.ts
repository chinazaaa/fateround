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
  isLandmineGame,
  isLudoGame,
  isMahjongGame,
  isMonopolyGame,
  isQuiplashGame,
  isQuickDrawGame,
  isScrabbleGame,
  isSecretMessageGame,
  isSnakeAndLadderGame,
  isSudokuGame,
  isCrosswordGame,
  isWordSearchGame,
  isWordScrambleGame,
  isMafiaGame,
  isDraughts10Game,
  isTrollRunGame,
  isWordGroupingGame,
  isWordleRoomGame,
  isTicTacToeGame,
  isTriviaGame,
  isTwoTruthsGame,
  isUnoGame,
  isWhotGame,
  isWordHuntGame,
  isWordRushGame,
  isYahtzeeGame,
  parseGameType,
} from './game-type-checks'
import { lobbyHasOpenPlayerSeat } from './game-limits-lite'
import { isMostLikelyTo, isNeverHaveIEver, isThisOrThat, isWouldYouRather } from './poll-games'
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

export function defaultLateJoinPolicyForGameType(gameType: GameType): LateJoinPolicy {
  if (isDescribeItGame(gameType)) return 'viewers_and_players'
  if (isWordRushGame(gameType)) return 'viewers_and_players'
  if (isQuickDrawGame(gameType)) return 'viewers_and_players'
  return 'viewers_only'
}

/**
 * MUST match `src/lib/viewers.ts`. It had drifted — this copy was missing Mafia, Draughts,
 * Word Scramble and Troll Run, so mobile offered "join as player" in four games where web
 * refuses it and a promoted player has no seat or turn to take. `viewers-parity.test.ts` runs
 * both copies over every game type so it cannot drift again.
 */
export function gameAllowsLatePlayerJoin(gameType: GameType): boolean {
  return (
    // Anonymous Messages is a closed circle: the session is messages between the people who
    // were in the room when it started, and the anonymity only means anything against a known,
    // fixed roster.
    !isAnonymousMessagesGame(gameType) &&
    !isMafiaGame(gameType) &&
    !isDraughts10Game(gameType) &&
    !isTrollRunGame(gameType) &&
    !isMonopolyGame(gameType) &&
    !isYahtzeeGame(gameType) &&
    !isWhotGame(gameType) &&
    !isCrazyEightsGame(gameType) &&
    !isUnoGame(gameType) &&
    !isLudoGame(gameType) &&
    !isMahjongGame(gameType) &&
    !isSnakeAndLadderGame(gameType) &&
    !isTicTacToeGame(gameType) &&
    !isChessGame(gameType) &&
    !isCheckersGame(gameType) &&
    !isAyoGame(gameType) &&
    !isScrabbleGame(gameType) &&
    !isSudokuGame(gameType) &&
    !isCrosswordGame(gameType) &&
    !isWordSearchGame(gameType)
  )
}

/**
 * Whether a seated host/player leaving mid-game can flip to spectator IN PLACE — POST
 * /api/players/spectate, which just sets spectator=true and keeps their row, score, and seat
 * id — versus needing the destructive removal path (DELETE /api/players → the game's
 * turn_order / hand / rotating-role cleanup, then a fresh viewer re-seat).
 *
 * Only games with NO turn_order / fixed-seat / rotating-role coupling — independent,
 * simultaneous play where `spectator` is a pure scoring flag — are safe for the in-place flip.
 * This is an explicit allow-list: everything NOT listed (board/card/duel games, rotating-role
 * games, quick_draw, poll subtypes, and anything new/uncertain) falls through to the removal
 * path. Erring that way is safe — at worst the leaver's score is dropped — whereas an in-place
 * flip on a turn game would strand them in turn_order and hand out ghost turns.
 */
export function gameSupportsInPlaceSpectate(gameType: GameType): boolean {
  return (
    isTriviaGame(gameType) ||
    isBingoGame(gameType) ||
    isICallOnGame(gameType) ||
    isLandmineGame(gameType) ||
    isCrosswordGame(gameType) ||
    isSudokuGame(gameType) ||
    isWordSearchGame(gameType) ||
    isWordScrambleGame(gameType) ||
    isWordHuntGame(gameType) ||
    isTwoTruthsGame(gameType) ||
    isQuiplashGame(gameType) ||
    isWordRushGame(gameType)
  )
}

/** MUST match `src/lib/viewers.ts` — see the note on gameAllowsLatePlayerJoin. */
export function gameOffersLateJoinChoice(gameType: GameType): boolean {
  return (
    // Both were missing here, so a late arrival on mobile never got the watch-or-play choice
    // that web offers for them.
    isWordGroupingGame(gameType) ||
    isWordleRoomGame(gameType) ||
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
    isLandmineGame(gameType) ||
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
  if (
    isMonopolyGame(gameType) ||
    isYahtzeeGame(gameType) ||
    isWhotGame(gameType) ||
    isCrazyEightsGame(gameType) ||
    isUnoGame(gameType)
  )
    return true
  if (!allowLatePlayers(game)) return true
  if (gameOffersLateJoinChoice(gameType)) return joinAsViewer === true
  return joinAsViewer === true
}
