import { isCustomGame, isPairGame, isThreeChoiceGame } from '@/lib/game-types'
import { isVoterOnlyMode } from '@/lib/participant-mode'
import type { Game, GameType } from '@/types'

/** Games where the host can choose gender-based vs names-only rounds. */
export function supportsGenderToggle(gameType: GameType | string | undefined): boolean {
  return isThreeChoiceGame(gameType) || isPairGame(gameType) || isCustomGame(gameType)
}

export function defaultGenderBasedForType(gameType: GameType | string | undefined): boolean {
  if (isCustomGame(gameType)) return false
  return supportsGenderToggle(gameType)
}

/** Whether rounds are same-gender and players vote by gender rules. */
export function isGameGenderBased(game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots'>): boolean {
  if (!supportsGenderToggle(game.game_type)) return false
  if (game.gender_based !== undefined && game.gender_based !== null) {
    return game.gender_based
  }
  if (isCustomGame(game.game_type)) {
    return game.custom_slots?.gender_based === true
  }
  return true
}

/** Import + name claim without asking gender (WST, Hot Seat, or gender-free voting games). */
export function isGenderFreeImportJoin(
  game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots' | 'participant_mode'>
): boolean {
  if ((game.participant_mode ?? 'import') !== 'import') return false
  const type = game.game_type
  if (type === 'who_said_this' || type === 'hot_seat') return true
  return isGenderFreeVoting(game)
}

/** Joiners lobby — free name entry, no gender (names-only SMK / pair / custom). */
export function isGenderFreeJoinersJoin(
  game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots' | 'participant_mode'>
): boolean {
  return (game.participant_mode ?? 'import') === 'joiners' && isGenderFreeVoting(game)
}

/** Voters-only lobby — free name entry, no gender (names-only SMK / pair / custom). */
export function isGenderFreeVotersJoin(
  game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots' | 'participant_mode'>
): boolean {
  return isVoterOnlyMode(game) && isGenderFreeVoting(game)
}

/** Rounds and voting ignore gender (names-only mode). */
export function isGenderFreeVoting(game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots'>): boolean {
  return supportsGenderToggle(game.game_type) && !isGameGenderBased(game)
}
