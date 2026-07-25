import type { MafiaRole } from '@/types'

// Mirrors packages/shared/src/mafia.ts's MAFIA_ROLE_INFO/mafiaRoleEmoji — web and shared
// keep separate copies per this codebase's web/shared parallel-copies convention (web
// does not import from packages/shared).

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
 * Static rules-text catalog for the Wolvesville-style "Roles" info drawer.
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
    description:
      'Choose one player to protect every night. That player cannot be killed that night — instead you are attacked. You survive the first attack, but die on the second. You automatically protect yourself every night too.',
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
    description:
      'During the day, shoot or reveal another player (each once, not on the same day). Only you see the revealed role; if they are not a villager, your role is revealed to them.',
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
    description: 'Leads the Mafia — your kill vote counts twice toward the nightly kill.',
  },
  wolf_cub: {
    role: 'wolf_cub',
    name: 'Junior Mafia',
    team: 'mafia',
    description:
      'Vote with your team on a player to kill each night. If you are killed, the Mafia gets a bonus kill the following night in revenge.',
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
      'Each night, douse 2 players in gasoline or ignite all doused players to kill them. You cannot be killed by the Mafia at night. You win if you are the last one standing.',
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
}

export const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']
export const NO_NIGHT_ACTION_ROLES: MafiaRole[] = ['villager', 'mayor', 'vigilante', 'jester', 'cursed_villager']
