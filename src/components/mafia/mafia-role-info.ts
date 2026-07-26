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
      return '🕵️'
    case 'aura_seer':
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
    case 'witch':
      return '🧙'
    case 'little_girl':
      return '🎀'
    case 'trapper':
      return '🪤'
    case 'seer':
      return '👁️'
    case 'mafia_seer':
      return '👁️‍🗨️'
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
    description: 'Each night, select two players to uncover whether they are on the same team.',
  },
  aura_seer: {
    role: 'aura_seer',
    name: 'Aura Seer',
    team: 'village',
    description:
      'Each night, investigate one player to learn their alignment: Good, Evil, or Unknown (Solo roles and kill/revive-capable Village roles).',
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
      'Vote with your team on a player to kill each night. Select a revenge target at any time — if you are killed, that player dies with you. If you die without picking, a random villager is chosen. If you flee, your target is spared.',
  },
  framer: {
    role: 'framer',
    name: 'Framer',
    team: 'mafia',
    description: "Each night, frame a player so the Aura Seer and Detective's investigations on them read as Mafia.",
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
  priest: {
    role: 'priest',
    name: 'Priest',
    team: 'village',
    description:
      'Once during the day, throw holy water on another player. If they are Mafia, they die. If not, you die and their innocence is announced.',
  },
  witch: {
    role: 'witch',
    name: 'Witch',
    team: 'village',
    description:
      'You have two potions: a Protect Potion (only consumed if it actually saves your target from a kill — free to reuse otherwise) and a Kill Potion (kill any player outright, once per game, not usable on night 1).',
  },
  little_girl: {
    role: 'little_girl',
    name: 'Little Girl',
    team: 'village',
    description:
      'Each night, you can choose to open your eyes. 75% you see nothing, 20% you identify a Mafia member, 5% they notice you and you die.',
  },
  trapper: {
    role: 'trapper',
    name: 'Trapper',
    team: 'village',
    description:
      "Each night, either set a trap on a player's house (up to 3 at once) or activate all your traps. Trapped players can't be killed while active — a Mafia kill on one instead kills the Mafia's weakest member, other attackers are simply blocked.",
  },
  seer: {
    role: 'seer',
    name: 'Seer',
    team: 'village',
    description: 'Each night, select a player to uncover their exact role.',
  },
  mafia_seer: {
    role: 'mafia_seer',
    name: 'Mafia Seer',
    team: 'mafia',
    description:
      'Each night, select a player to uncover their exact role, and share what you learn with your fellow Mafia. You cannot vote to kill unless you resign your ability (self-target at night), permanently becoming a Regular Mafia.',
  },
}

export const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer']
export const NO_NIGHT_ACTION_ROLES: MafiaRole[] = [
  'villager',
  'mayor',
  'vigilante',
  'jester',
  'cursed_villager',
  'priest',
]
