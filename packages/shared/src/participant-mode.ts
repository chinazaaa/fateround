import type { Game, ParticipantMode } from './types'
import { isMostLikelyTo } from './poll-games'

export function parseParticipantMode(raw: unknown): ParticipantMode {
  if (raw === 'joiners' || raw === 'voters') return raw
  return 'import'
}

/** Host uploaded a list; players join with their own name to vote (not on the list). */
export function isVoterOnlyMode(game: Pick<Game, 'participant_mode' | 'game_type'>): boolean {
  if (game.participant_mode === 'voters') return true
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

/** Play again can reuse or replace the host-uploaded name list. */
export function supportsHostListPlayAgain(game: Pick<Game, 'participant_mode'>): boolean {
  return usesHostParticipantList(parseParticipantMode(game.participant_mode))
}

export function hostListPlayAgainHint(
  game: Pick<Game, 'participant_mode' | 'participant_filter' | 'game_type'>
): string {
  if (isVoterOnlyMode(game)) {
    return 'Import list — vote only: your CSV stays by default. Names that were not in rounds last game are picked first.'
  }
  if (isImportClaimMode(game)) {
    if (getFullHostListForRounds(game)) {
      return 'Pre-set roster, everyone on the list: your CSV stays by default. Names that missed last game are prioritized in rounds.'
    }
    return 'Pre-set roster: your CSV stays by default. Among players who joined, those who missed last game are prioritized.'
  }
  return 'Your name list stays by default. People who did not appear in rounds last game are prioritized.'
}

/** Round pool uses every name on the host list (not only claimed/joined list names). */
export function getFullHostListForRounds(
  game: Pick<Game, 'participant_mode' | 'participant_filter' | 'game_type'>
): boolean {
  if (isVoterOnlyMode(game)) return true
  if (game.participant_mode === 'joiners') return false
  return game.participant_filter === 'all'
}

/** Names already claimed by a joined player. */
export function claimedParticipantIds(players: Array<{ participant_id?: string | null }>): Set<string> {
  const ids = new Set<string>()
  for (const player of players) {
    if (player.participant_id) ids.add(player.participant_id)
  }
  return ids
}
