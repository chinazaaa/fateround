import type { MafiaPhase, MafiaTeam, MafiaChatMessage, MafiaPublicPlayer, MafiaMyState, MafiaRole } from '@/types'

export interface MafiaStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
  winningTeam: (MafiaTeam | 'lovers') | null
  players: MafiaPublicPlayer[]
  lastNightKillPlayerId: string | null
  lastNightMafiaHadTarget: boolean
  lastVoteResultPlayerId: string | null
  voteTallies: Record<string, number>
  voteChoices?: Record<string, string>
  votesRequired?: number
  dayChatMessages?: MafiaChatMessage[]
  ghostChatMessages?: MafiaChatMessage[]
  enabledRoles: MafiaRole[]
  roleCounts?: Partial<Record<MafiaRole, number>>
  myState: MafiaMyState | null
}
