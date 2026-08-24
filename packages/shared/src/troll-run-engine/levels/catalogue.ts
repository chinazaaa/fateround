/**
 * The authored level catalogue.
 *
 * Kept apart from `index.ts` so that the round recipe in `descriptors.ts` can rank a world's levels
 * by difficulty without importing the resolver that in turn depends on it. `index.ts` re-exports
 * everything here, so this split is invisible from outside the folder.
 */

import type { TrollRunLevel, TrollRunWorldId } from '../types'
import { TROLL_RUN_DEFAULT_WORLD } from '../types'
import { WORLD_1_LEVELS } from './world-1-pits'
import { WORLD_2_LEVELS } from './world-2-doors'
import { WORLD_3_LEVELS } from './world-3-gravity'
import { WORLD_4_LEVELS } from './world-4-gauntlet'
import { WORLD_5_LEVELS } from './world-5-machines'

export interface TrollRunWorldConfig {
  id: TrollRunWorldId
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
  {
    id: 'machines',
    name: 'World 5: The Machine Room',
    subtitle: 'Sweeping presses & moving walkways',
    icon: '⚙️',
    levels: WORLD_5_LEVELS,
  },
]

export const ALL_TROLL_RUN_LEVELS: TrollRunLevel[] = [
  ...WORLD_1_LEVELS,
  ...WORLD_2_LEVELS,
  ...WORLD_3_LEVELS,
  ...WORLD_4_LEVELS,
  ...WORLD_5_LEVELS,
]

const LEVELS_BY_WORLD_ID = new Map<string, TrollRunLevel[]>(TROLL_RUN_WORLDS.map((world) => [world.id, world.levels]))

export function getWorldLevels(worldId?: string | null): TrollRunLevel[] {
  const levels = worldId ? LEVELS_BY_WORLD_ID.get(worldId.toLowerCase()) : undefined
  return levels ?? LEVELS_BY_WORLD_ID.get(TROLL_RUN_DEFAULT_WORLD) ?? WORLD_1_LEVELS
}
