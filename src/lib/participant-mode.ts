import { isMostLikelyTo } from '@/lib/game-types'
import type { Game, ParticipantMode } from '@/types'

export function parseParticipantMode(raw: unknown): ParticipantMode {
  if (raw === 'joiners' || raw === 'voters') return raw
  return 'import'
}

/** Host uploaded a list; players join with their own name to vote (not on the list). */
export function isVoterOnlyMode(game: Pick<Game, 'participant_mode' | 'game_type'>): boolean {
  if (game.participant_mode === 'voters') return true
  // Legacy MLT games created before the `voters` mode existed
  return isMostLikelyTo(game.game_type) && game.participant_mode === 'import'
}

/** Host list + each player claims their name from the list when joining. */
export function isImportClaimMode(game: Pick<Game, 'participant_mode' | 'game_type'>): boolean {
  if (game.participant_mode !== 'import') return false
  if (isMostLikelyTo(game.game_type)) return false
  return true
}

export function isJoinersPollMode(game: Pick<Game, 'participant_mode'>): boolean {
  return game.participant_mode === 'joiners'
}

/** Host builds a name list during create (import claim, voters-only, WST, Hot Seat). */
export function usesHostParticipantList(mode: ParticipantMode): boolean {
  return mode === 'import' || mode === 'voters'
}

/** Round pool uses every name on the host list (not only claimed/joined list names). */
export function useFullHostListForRounds(game: Pick<Game, 'participant_mode' | 'participant_filter' | 'game_type'>): boolean {
  if (isVoterOnlyMode(game)) return true
  if (game.participant_mode === 'joiners') return false
  return game.participant_filter === 'all'
}
