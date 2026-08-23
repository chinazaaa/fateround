/**
 * The wire format for a round's levels.
 *
 * `troll_run_sessions.level_order` is a jsonb array of strings, and each string is both the recipe for
 * one level and that level's id — `report-clear` locates a player with `level_order.indexOf(levelId)`,
 * so the two can never be allowed to drift apart. Three shapes:
 *
 *     pits-03                 authored, exactly as written
 *     pits-03:m               authored, mirrored left to right
 *     pits:gen:81423:4:0      generated: world, seed, slot, and the attempt that passed validation
 *
 * A plain id is also what every session created before generation shipped contains, which is why that
 * shape stays the simplest one and keeps resolving as it always did.
 *
 * `:` separates because the player view keys its level memo on `level_order.join('|')`.
 */

import { TROLL_RUN_LEVELS_PER_ROUND, isTrollRunWorldId, type TrollRunLevel, type TrollRunWorldId } from '../types'
import { getWorldLevels } from './catalogue'
import { findFairTrollRunAttempt } from './generate'
import { mirrorTrollRunLevel } from './mirror'
import { checkTrollRunReachable } from './reach'
import { createSeededRng, hashSeedText, randomInt } from './seeded-rng'

const GENERATED_MARKER = 'gen'
const MIRRORED_MARKER = 'm'

/** Authored levels per round. The rest are generated, so most of a round is new every time. */
const AUTHORED_PER_ROUND = 3

export interface TrollRunAuthoredDescriptor {
  kind: 'authored'
  /** Id of a level in the world's authored set. */
  levelId: string
  mirrored: boolean
}

export interface TrollRunGeneratedDescriptor {
  kind: 'generated'
  world: TrollRunWorldId
  seed: number
  /** Zero-based position in the round, which drives the difficulty ramp. */
  slot: number
  attempt: number
}

export type TrollRunLevelDescriptor = TrollRunAuthoredDescriptor | TrollRunGeneratedDescriptor

function parseWholeNumber(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : null
}

/**
 * Reads one stored entry, or returns null if it is not a descriptor this build understands. Callers
 * skip what they cannot read, which is how a session written by a newer build degrades instead of
 * throwing.
 */
export function parseTrollRunLevelDescriptor(descriptor: string): TrollRunLevelDescriptor | null {
  const parts = descriptor.split(':')

  if (parts.length === 1) {
    return parts[0].length > 0 ? { kind: 'authored', levelId: parts[0], mirrored: false } : null
  }

  if (parts.length === 2 && parts[1] === MIRRORED_MARKER) {
    return parts[0].length > 0 ? { kind: 'authored', levelId: parts[0], mirrored: true } : null
  }

  if (parts.length === 5 && parts[1] === GENERATED_MARKER) {
    const [world, , seedText, slotText, attemptText] = parts
    if (!isTrollRunWorldId(world)) return null

    const seed = parseWholeNumber(seedText)
    const slot = parseWholeNumber(slotText)
    const attempt = parseWholeNumber(attemptText)
    if (seed === null || slot === null || attempt === null) return null

    return { kind: 'generated', world, seed, slot, attempt }
  }

  return null
}

export function formatTrollRunLevelDescriptor(descriptor: TrollRunLevelDescriptor): string {
  if (descriptor.kind === 'authored') {
    return descriptor.mirrored ? `${descriptor.levelId}:${MIRRORED_MARKER}` : descriptor.levelId
  }
  return [descriptor.world, GENERATED_MARKER, descriptor.seed, descriptor.slot, descriptor.attempt].join(':')
}

/**
 * Answers, once per level, whether its reflection can still be finished.
 *
 * Reflecting is very nearly free in fairness terms — the physics has one MOVE_SPEED and symmetric
 * spike hitboxes — but `Math.floor(x / 16)` does not commute with `320 - x`, so a level whose route
 * depends on a sub-pixel window can lose it. `doors-09` holds the runner level with its sky door for
 * only part of a bounce arc and is exactly that case. Rather than keep a hand-maintained list of which
 * levels may be mirrored, the mirror is checked; a level that fails simply plays the right way round.
 *
 * The answer is cached because it depends on nothing but the authored level, which is a module-level
 * singleton, and a round would otherwise pay for the search again on every build.
 */
const mirrorClearable = new Map<string, boolean>()

function mirrorIsClearable(level: TrollRunLevel): boolean {
  const cached = mirrorClearable.get(level.id)
  if (cached !== undefined) return cached

  const clearable = checkTrollRunReachable(mirrorTrollRunLevel(level, `${level.id}:${MIRRORED_MARKER}`)).solvable
  mirrorClearable.set(level.id, clearable)
  return clearable
}

/**
 * The ten descriptors for one round.
 *
 * Seven slots are generated fresh from `seed`; three are authored, and never the opening or closing
 * slot — a round should begin and end on something nobody has walked before. An authored level takes
 * its slot's own rank in the difficulty ramp (slot four gets the world's fourth-easiest), so dropping
 * a hand-built level into a generated round never spikes or flattens the curve. Half of them arrive
 * mirrored, which is enough to stop a player replaying a memorised sequence of inputs.
 *
 * This is the expensive call in the whole feature — it validates every generated slot — so it belongs
 * on the server, where a round is built once, rather than on each client.
 */
export function buildTrollRunRoundDescriptors(world: TrollRunWorldId, seed: number): string[] {
  const rng = createSeededRng(hashSeedText(`${world}:round:${seed}`))
  const byDifficulty = [...getWorldLevels(world)].sort((first, second) =>
    first.parTime === second.parTime ? first.id.localeCompare(second.id) : first.parTime - second.parTime
  )

  const firstEligible = 1
  const lastEligible = TROLL_RUN_LEVELS_PER_ROUND - 2
  const authoredSlots = new Set<number>()
  const authoredWanted = Math.min(AUTHORED_PER_ROUND, lastEligible - firstEligible + 1)
  while (authoredSlots.size < authoredWanted) {
    authoredSlots.add(randomInt(rng, firstEligible, lastEligible))
  }

  const descriptors: string[] = []
  const sortedAuthoredSlots = [...authoredSlots].sort((a, b) => a - b)
  const chosenAuthoredBySlot = new Map<number, TrollRunLevel>()

  // Pick unique authored levels across easy, medium, hard pools so levels vary per round
  const easyPool = byDifficulty.slice(0, 4)
  const medPool = byDifficulty.slice(4, 7)
  const hardPool = byDifficulty.slice(7)

  const pickedEasy = easyPool[Math.floor(rng() * easyPool.length)]
  const pickedMed = medPool[Math.floor(rng() * medPool.length)]
  const pickedHard = hardPool[Math.floor(rng() * hardPool.length)]

  const chosenLevels = [pickedEasy, pickedMed, pickedHard].sort((a, b) =>
    a.parTime === b.parTime ? a.id.localeCompare(b.id) : a.parTime - b.parTime
  )

  for (let i = 0; i < sortedAuthoredSlots.length; i += 1) {
    chosenAuthoredBySlot.set(sortedAuthoredSlots[i], chosenLevels[i])
  }

  for (let slot = 0; slot < TROLL_RUN_LEVELS_PER_ROUND; slot += 1) {
    if (authoredSlots.has(slot)) {
      const authored = chosenAuthoredBySlot.get(slot) ?? byDifficulty[Math.min(slot, byDifficulty.length - 1)]
      const wantsMirror = rng() < 0.5
      descriptors.push(
        formatTrollRunLevelDescriptor({
          kind: 'authored',
          levelId: authored.id,
          mirrored: wantsMirror && mirrorIsClearable(authored),
        })
      )
      continue
    }

    descriptors.push(
      formatTrollRunLevelDescriptor({
        kind: 'generated',
        world,
        seed,
        slot,
        attempt: findFairTrollRunAttempt(world, seed, slot),
      })
    )
  }

  return descriptors
}
