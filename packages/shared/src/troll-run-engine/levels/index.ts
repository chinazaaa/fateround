import type { TrollRunLevel } from '../types'
import { getWorldLevels } from './catalogue'
import { parseTrollRunLevelDescriptor } from './descriptors'
import { generateTrollRunLevel } from './generate'
import { mirrorTrollRunLevel } from './mirror'

export { WORLD_1_LEVELS } from './world-1-pits'
export { WORLD_2_LEVELS } from './world-2-doors'
export { WORLD_3_LEVELS } from './world-3-gravity'
export { WORLD_4_LEVELS } from './world-4-gauntlet'

export { ALL_TROLL_RUN_LEVELS, TROLL_RUN_WORLDS, getWorldLevels, type TrollRunWorldConfig } from './catalogue'

export {
  buildTrollRunRoundDescriptors,
  formatTrollRunLevelDescriptor,
  parseTrollRunLevelDescriptor,
  type TrollRunAuthoredDescriptor,
  type TrollRunGeneratedDescriptor,
  type TrollRunLevelDescriptor,
} from './descriptors'

/**
 * Turns the session's stored level order into playable levels so every client runs the
 * exact sequence the server scored. Unknown ids are skipped; an empty or fully unknown
 * order falls back to the world's authored order.
 *
 * A generated entry is rebuilt here rather than fetched, which is what keeps the round off the wire:
 * the descriptor already names the seed, the slot and the attempt that passed validation, so this
 * costs a few array writes and no solving at all.
 *
 * The resolved level's id is the descriptor verbatim, because the scoring routes look a player up with
 * `level_order.indexOf(levelId)`.
 */
export function resolveTrollRunLevels(
  levelOrder: string[] | null | undefined,
  worldId?: string | null
): TrollRunLevel[] {
  const worldLevels = getWorldLevels(worldId)
  if (!Array.isArray(levelOrder) || levelOrder.length === 0) return worldLevels

  const levelsById = new Map(worldLevels.map((level) => [level.id, level]))
  const ordered: TrollRunLevel[] = []

  for (const entry of levelOrder) {
    // The order arrives from a jsonb column, so anything that is not a readable descriptor is skipped
    // exactly as an unknown level id always was.
    const descriptor = typeof entry === 'string' ? parseTrollRunLevelDescriptor(entry) : null
    if (!descriptor) continue

    if (descriptor.kind === 'generated') {
      ordered.push(
        generateTrollRunLevel({
          id: entry,
          world: descriptor.world,
          seed: descriptor.seed,
          slot: descriptor.slot,
          attempt: descriptor.attempt,
        })
      )
      continue
    }

    const authored = levelsById.get(descriptor.levelId)
    if (!authored) continue
    ordered.push(descriptor.mirrored ? mirrorTrollRunLevel(authored, entry) : authored)
  }

  return ordered.length > 0 ? ordered : worldLevels
}
