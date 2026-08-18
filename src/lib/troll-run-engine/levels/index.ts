import type { TrollRunLevel } from '../types'
import { WORLD_1_LEVELS } from './world-1-pits'
import { WORLD_2_LEVELS } from './world-2-doors'
import { WORLD_3_LEVELS } from './world-3-gravity'
import { WORLD_4_LEVELS } from './world-4-gauntlet'

export { WORLD_1_LEVELS } from './world-1-pits'
export { WORLD_2_LEVELS } from './world-2-doors'
export { WORLD_3_LEVELS } from './world-3-gravity'
export { WORLD_4_LEVELS } from './world-4-gauntlet'

export interface TrollRunWorldConfig {
  id: string
  name: string
  subtitle: string
  icon: string
  levels: TrollRunLevel[]
}

export const TROLL_RUN_WORLDS: TrollRunWorldConfig[] = [
  {
    id: 'pits',
    name: 'World 1: The Pits',
    subtitle: 'Collapsing floors & hidden drop-offs',
    icon: '🕳️',
    levels: WORLD_1_LEVELS,
  },
  {
    id: 'doors',
    name: 'World 2: Runaway Doors',
    subtitle: 'Elusive exit doors & moving walls',
    icon: '🚪',
    levels: WORLD_2_LEVELS,
  },
  {
    id: 'gravity',
    name: 'World 3: Gravity Flip',
    subtitle: 'Ceiling running & inverted controls',
    icon: '🔄',
    levels: WORLD_3_LEVELS,
  },
  {
    id: 'gauntlet',
    name: 'World 4: The Gauntlet',
    subtitle: 'Master trials combining all traps',
    icon: '👑',
    levels: WORLD_4_LEVELS,
  },
]

export const ALL_TROLL_RUN_LEVELS: TrollRunLevel[] = [
  ...WORLD_1_LEVELS,
  ...WORLD_2_LEVELS,
  ...WORLD_3_LEVELS,
  ...WORLD_4_LEVELS,
]

export function getWorldLevels(worldId?: string | null): TrollRunLevel[] {
  switch (worldId?.toLowerCase()) {
    case 'doors':
      return WORLD_2_LEVELS
    case 'gravity':
      return WORLD_3_LEVELS
    case 'gauntlet':
      return WORLD_4_LEVELS
    case 'pits':
    default:
      return WORLD_1_LEVELS
  }
}
