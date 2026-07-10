import type {
  MafiaChatMessage,
  MafiaMyState,
  MafiaPhase,
  MafiaPublicPlayer,
  MafiaTeam,
} from './types'

export const MAFIA_MIN_PLAYERS = 5
export const MAFIA_MAX_PLAYERS = 16

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

export function mafiaPhaseLabel(phase: MafiaPhase): string {
  switch (phase) {
    case 'role_reveal':
      return 'Role reveal'
    case 'night':
      return 'Night'
    case 'day_report':
      return 'Sunrise'
    case 'day':
      return 'Day discussion'
    case 'elimination':
      return 'Elimination'
    case 'game_over':
      return 'Game over'
    default:
      return phase
  }
}

export function secondsUntilMafiaDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
}

export function mafiaRoleEmoji(role: string): string {
  switch (role) {
    case 'mafia':
      return '🔪'
    case 'doctor':
      return '🏥'
    case 'detective':
      return '🔍'
    default:
      return '🏘️'
  }
}

export type { MafiaChatMessage, MafiaMyState, MafiaPhase, MafiaPublicPlayer, MafiaTeam }
