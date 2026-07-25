import type { MafiaPhase, MafiaTeam, MafiaChatMessage, MafiaPublicPlayer, MafiaMyState, MafiaRole } from '@/types'

export interface MafiaStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  doctorEnabled: boolean
  detectiveEnabled: boolean
  auraSeerEnabled: boolean
  anonymousVotes: boolean
  winningTeam: (MafiaTeam | 'lovers') | null
  players: MafiaPublicPlayer[]
  lastNightKillPlayerId: string | null
  lastNightMafiaHadTarget: boolean
  lastVoteResultPlayerId: string | null
  voteTallies: Record<string, number>
  voteChoices?: Record<string, string>
  votedPlayerIds?: string[]
  votesRequired?: number
  dayChatMessages?: MafiaChatMessage[]
  ghostChatMessages?: MafiaChatMessage[]
  enabledRoles: MafiaRole[]
  /** Roles actually assigned to a player in this game (alive or eliminated) — unlike
   *  enabledRoles (the host's toggle settings), this only lists roles someone is really
   *  playing, so the Roles drawer doesn't advertise a role nobody got this game. Grows if a
   *  late joiner gets assigned a role not seen before. */
  rolesInGame?: MafiaRole[]
  roleCounts?: Partial<Record<MafiaRole, number>>
  skipRequiredCount?: number
  skipRequestCount?: number
  hasRequestedSkip?: boolean
  myState: MafiaMyState | null
}
