import type { Game, Participant, Player } from '@/types'
import { isMostLikelyTo } from '@/lib/game-types'

export type MltTargetKind = 'player' | 'participant'

export interface MltVoteTarget {
  id: string
  name: string
  kind: MltTargetKind
}

export function isMltImportGame(game: Pick<Game, 'game_type' | 'participant_mode'>): boolean {
  return isMostLikelyTo(game.game_type) && game.participant_mode === 'import'
}

export function mltVoteTargets(
  game: Pick<Game, 'game_type' | 'participant_mode'>,
  participants: Participant[],
  players: Player[]
): MltVoteTarget[] {
  if (isMltImportGame(game)) {
    return participants
      .map((p) => ({ id: p.id, name: p.name, kind: 'participant' as const }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }
  return [...players]
    .map((p) => ({ id: p.id, name: p.name, kind: 'player' as const }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function mltTargetIdFromVote(
  vote: { target_player_id?: string | null; target_participant_id?: string | null },
  kind: MltTargetKind
): string | null {
  return kind === 'participant' ? vote.target_participant_id ?? null : vote.target_player_id ?? null
}
