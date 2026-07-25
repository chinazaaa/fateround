import type { MafiaChatMessage, MafiaMyState, MafiaPhase, MafiaPublicPlayer, MafiaRole, MafiaTeam } from './types'

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
  winningTeam: (MafiaTeam | 'lovers') | null
  players: MafiaPublicPlayer[]
  lastNightKillPlayerId: string | null
  lastNightMafiaHadTarget: boolean
  lastVoteResultPlayerId: string | null
  voteTallies: Record<string, number>
  dayChatMessages?: MafiaChatMessage[]
  ghostChatMessages?: MafiaChatMessage[]
  enabledRoles: MafiaRole[]
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
    case 'voting':
      return 'Voting'
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
    case 'alpha_wolf':
      return '🐺'
    case 'wolf_cub':
      return '🐾'
    case 'framer':
      return '🎭'
    case 'doctor':
      return '🏥'
    case 'detective':
      return '🔍'
    case 'bodyguard':
      return '🛡️'
    case 'mayor':
      return '🎖️'
    case 'vigilante':
      return '🔫'
    case 'tracker':
      return '👣'
    case 'jester':
      return '🃏'
    case 'serial_killer':
      return '🔪'
    case 'arsonist':
      return '🔥'
    case 'cupid':
      return '💘'
    case 'cursed_villager':
      return '☠️'
    case 'medium':
      return '🔮'
    case 'priest':
      return '⛪'
    default:
      return '🏘️'
  }
}

export interface MafiaRoleInfo {
  role: MafiaRole
  name: string
  team: 'village' | 'mafia' | 'solo' | 'special'
  description: string
}

/**
 * Static rules-text catalog for the Wolvesville-style "Roles" info drawer — one shared
 * source so web and mobile render identical role descriptions.
 */
export const MAFIA_ROLE_INFO: Record<MafiaRole, MafiaRoleInfo> = {
  villager: {
    role: 'villager',
    name: 'Villager',
    team: 'village',
    description: 'No special powers. Use the day discussion and your vote to find the Mafia.',
  },
  doctor: {
    role: 'doctor',
    name: 'Doctor',
    team: 'village',
    description: 'Each night, choose one player (not yourself) to heal, saving them from any kill that night.',
  },
  detective: {
    role: 'detective',
    name: 'Detective',
    team: 'village',
    description: "Each night, investigate one player to learn whether they're Village or Mafia-aligned.",
  },
  bodyguard: {
    role: 'bodyguard',
    name: 'Bodyguard',
    team: 'village',
    description: 'Each night, protect one player. If that player is attacked, you die in their place instead.',
  },
  mayor: {
    role: 'mayor',
    name: 'Mayor',
    team: 'village',
    description: 'Your day vote counts as two votes toward the lynch majority.',
  },
  vigilante: {
    role: 'vigilante',
    name: 'Vigilante',
    team: 'village',
    description: 'You may kill one player at night — but only once per game, so choose carefully.',
  },
  tracker: {
    role: 'tracker',
    name: 'Tracker',
    team: 'village',
    description: 'Each night, learn who your target visited (targeted) that night.',
  },
  mafia: {
    role: 'mafia',
    name: 'Mafia',
    team: 'mafia',
    description: 'Each night, vote with your team on a player to kill. Chat privately with your fellow Mafia.',
  },
  alpha_wolf: {
    role: 'alpha_wolf',
    name: 'Alpha Mafia',
    team: 'mafia',
    description: 'Leads the Mafia — your kill vote counts twice, and you can chat with your crew during the day too.',
  },
  wolf_cub: {
    role: 'wolf_cub',
    name: 'Junior Mafia',
    team: 'mafia',
    description: 'If you are killed, the Mafia gets a bonus kill the following night in revenge.',
  },
  framer: {
    role: 'framer',
    name: 'Framer',
    team: 'mafia',
    description: "Each night, frame a player so the Detective's investigation on them reads as Mafia.",
  },
  jester: {
    role: 'jester',
    name: 'Jester',
    team: 'solo',
    description: 'You win alone if the town votes to lynch you. Otherwise, you lose with no other win condition.',
  },
  serial_killer: {
    role: 'serial_killer',
    name: 'Serial Killer',
    team: 'solo',
    description: 'Each night, kill a player on your own. You win if you are the last one standing.',
  },
  arsonist: {
    role: 'arsonist',
    name: 'Arsonist',
    team: 'solo',
    description:
      'Each night, douse a player in fuel, or ignite everyone doused so far to kill them all at once. You win if you are the last one standing.',
  },
  cupid: {
    role: 'cupid',
    name: 'Cupid',
    team: 'special',
    description:
      'On night one only, link two players (possibly including yourself) as Lovers. The Lovers win together if both survive to the end.',
  },
  cursed_villager: {
    role: 'cursed_villager',
    name: 'Cursed Villager',
    team: 'special',
    description:
      'Starts on the Village team, but if the Mafia targets you, you convert to Mafia and survive instead of dying.',
  },
  medium: {
    role: 'medium',
    name: 'Medium',
    team: 'village',
    description:
      'Can read ghost chat at night to hear the dead. Once per game, choose a dead player at night to revive them.',
  },
  priest: {
    role: 'priest',
    name: 'Priest',
    team: 'village',
    description:
      'Once during the day, throw holy water on another player. If they are Mafia, they die. If not, you die and their innocence is announced.',
  },
}

export type { MafiaChatMessage, MafiaMyState, MafiaPhase, MafiaPublicPlayer, MafiaRole, MafiaTeam }
