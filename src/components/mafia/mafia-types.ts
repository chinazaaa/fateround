import type { MafiaPhase, MafiaTeam, MafiaChatMessage, MafiaPublicPlayer, MafiaMyState } from '@/types'

export interface MafiaStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
  winningTeam: MafiaTeam | null
  players: MafiaPublicPlayer[]
  lastNightKillPlayerId: string | null
  lastNightMafiaHadTarget: boolean
  lastVoteResultPlayerId: string | null
  voteTallies: Record<string, number>
  dayChatMessages?: MafiaChatMessage[]
  ghostChatMessages?: MafiaChatMessage[]
  myState: MafiaMyState | null
}
