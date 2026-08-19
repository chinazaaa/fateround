import { describe, expect, it } from 'vitest'
import { getWorldLevels } from './catalogue'
import {
  buildTrollRunRoundDescriptors,
  formatTrollRunLevelDescriptor,
  parseTrollRunLevelDescriptor,
} from './descriptors'
import { mirrorTrollRunLevel } from './mirror'
import { checkTrollRunReachable } from './reach'
import { resolveTrollRunLevels } from './index'
import { TROLL_RUN_LEVELS_PER_ROUND, TROLL_RUN_WORLD_IDS, type TrollRunWorldId } from '../types'

/**
 * Building a round validates seven generated slots against the physics solver, so each seed here
 * costs real time. Eight is enough to see every authored level land in a round at least once.
 */
const SEEDS = [1_000, 8_919, 16_838, 24_757, 32_676, 40_595, 48_514, 56_433]
const ROUND_TIMEOUT_MS = 600_000

interface RoundRow {
  world: TrollRunWorldId
  seed: number
  descriptors: string[]
}

const ROUNDS: RoundRow[] = (() => {
  const rows: RoundRow[] = []
  for (const world of TROLL_RUN_WORLD_IDS) {
    for (const seed of SEEDS) {
      rows.push({ world, seed, descriptors: buildTrollRunRoundDescriptors(world, seed) })
    }
  }
  return rows
})()

function authoredEntries(): { world: TrollRunWorldId; entry: string; levelId: string; mirrored: boolean }[] {
  return ROUNDS.flatMap((round) =>
    round.descriptors.flatMap((entry) => {
      const descriptor = parseTrollRunLevelDescriptor(entry)
      if (!descriptor || descriptor.kind !== 'authored') return []
      return [{ world: round.world, entry, levelId: descriptor.levelId, mirrored: descriptor.mirrored }]
    })
  )
}

describe('parseTrollRunLevelDescriptor / formatTrollRunLevelDescriptor', () => {
  it('reads the three shapes a round can contain', () => {
    expect(parseTrollRunLevelDescriptor('pits-03')).toEqual({ kind: 'authored', levelId: 'pits-03', mirrored: false })
    expect(parseTrollRunLevelDescriptor('pits-03:m')).toEqual({ kind: 'authored', levelId: 'pits-03', mirrored: true })
    expect(parseTrollRunLevelDescriptor('gravity:gen:81423:4:2')).toEqual({
      kind: 'generated',
      world: 'gravity',
      seed: 81423,
      slot: 4,
      attempt: 2,
    })
  })

  it('round-trips every shape through format and back', () => {
    for (const entry of ['pits-03', 'doors-10:m', 'gauntlet:gen:7:9:0', 'gravity:gen:4294967295:0:5']) {
      const descriptor = parseTrollRunLevelDescriptor(entry)
      expect(descriptor, `${entry} did not parse`).not.toBeNull()
      expect(formatTrollRunLevelDescriptor(descriptor!), `${entry} did not survive a round trip`).toBe(entry)
    }
  })

  it('refuses anything it cannot read, so a bad row is skipped rather than crashing a round', () => {
    for (const entry of [
      '',
      ':m',
      'pits-03:x',
      'pits-03:m:extra',
      'atlantis:gen:1:2:3',
      'pits:gen:1:2',
      'pits:gen:1:2:3:4',
      'pits:gen:-1:2:3',
      'pits:gen:1.5:2:3',
      'pits:gen:1:two:3',
      'pits:gen:99999999999999999999:2:3',
    ]) {
      expect(parseTrollRunLevelDescriptor(entry), `${JSON.stringify(entry)} should not parse`).toBeNull()
    }
  })
})

describe('buildTrollRunRoundDescriptors', () => {
  it(
    'fills a full round, three of it authored and the rest generated',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        const where = `${world} seed ${seed}`
        expect(descriptors, `${where}: round length`).toHaveLength(TROLL_RUN_LEVELS_PER_ROUND)

        const kinds = descriptors.map((entry) => parseTrollRunLevelDescriptor(entry)?.kind ?? 'unreadable')
        expect(
          kinds.filter((kind) => kind === 'authored'),
          `${where}: authored slots`
        ).toHaveLength(3)
        expect(
          kinds.filter((kind) => kind === 'generated'),
          `${where}: generated slots`
        ).toHaveLength(7)
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'opens and closes on something nobody has walked before',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        const where = `${world} seed ${seed}`
        expect(parseTrollRunLevelDescriptor(descriptors[0])?.kind, `${where}: first slot`).toBe('generated')
        expect(parseTrollRunLevelDescriptor(descriptors[descriptors.length - 1])?.kind, `${where}: last slot`).toBe(
          'generated'
        )
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'tags every generated slot with its own position and the round seed',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        descriptors.forEach((entry, slot) => {
          const descriptor = parseTrollRunLevelDescriptor(entry)
          if (descriptor?.kind !== 'generated') return
          expect(descriptor.world, `${entry}: world`).toBe(world)
          expect(descriptor.seed, `${entry}: seed`).toBe(seed)
          expect(descriptor.slot, `${entry}: slot`).toBe(slot)
        })
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'draws authored levels from the round’s own world, ranked by where they land',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        const worldLevelIds = new Set(getWorldLevels(world).map((level) => level.id))
        const parBySlot = new Map<number, number>()

        descriptors.forEach((entry, slot) => {
          const descriptor = parseTrollRunLevelDescriptor(entry)
          if (descriptor?.kind !== 'authored') return

          expect(
            worldLevelIds.has(descriptor.levelId),
            `${world} seed ${seed}: ${descriptor.levelId} is not its level`
          ).toBe(true)
          const level = getWorldLevels(world).find((candidate) => candidate.id === descriptor.levelId)
          parBySlot.set(slot, level?.parTime ?? 0)
        })

        // A hand-built level takes its slot's own rank in the ramp, so the later slot is never the easier one.
        const ranked = [...parBySlot.entries()].sort((first, second) => first[0] - second[0])
        for (let index = 1; index < ranked.length; index += 1) {
          expect(
            ranked[index][1],
            `${world} seed ${seed}: authored par fell at slot ${ranked[index][0]}`
          ).toBeGreaterThanOrEqual(ranked[index - 1][1])
        }
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'gives the same seed the same round and different seeds different ones',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        expect(buildTrollRunRoundDescriptors(world, seed), `${world} seed ${seed} is not reproducible`).toEqual(
          descriptors
        )
      }

      for (const world of TROLL_RUN_WORLD_IDS) {
        const rounds = new Set(
          ROUNDS.filter((round) => round.world === world).map((round) => round.descriptors.join('|'))
        )
        expect(rounds.size, `${world} repeats itself across seeds`).toBe(SEEDS.length)
      }
    },
    ROUND_TIMEOUT_MS
  )

  /**
   * The guard in `descriptors.ts`: `doors-09` cannot be mirrored, because its bounce arc holds the
   * runner level with the sky door for only part of a jump and tile arithmetic does not reflect
   * exactly. It has to keep appearing in rounds — just never with the mirror marker.
   */
  it(
    'never mirrors a level whose reflection cannot be finished',
    () => {
      const authored = authoredEntries()
      expect(
        authored.map((row) => row.levelId),
        'doors-09 never came up, so the guard went untested'
      ).toContain('doors-09')
      expect(authored.filter((row) => row.mirrored).map((row) => row.entry)).not.toContain('doors-09:m')

      for (const row of authored) {
        if (!row.mirrored) continue
        const level = getWorldLevels(row.world).find((candidate) => candidate.id === row.levelId)
        expect(level, `${row.entry}: level is missing`).toBeDefined()
        const mirrored = mirrorTrollRunLevel(level!, row.entry)
        expect(checkTrollRunReachable(mirrored).solvable, `${row.entry} cannot be finished`).toBe(true)
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'mirrors some of what it can, or the authored slots would be the memorised ones again',
    () => {
      expect(authoredEntries().some((row) => row.mirrored)).toBe(true)
    },
    ROUND_TIMEOUT_MS
  )
})

describe('resolveTrollRunLevels', () => {
  it(
    'turns a whole round into playable levels, in order, keeping the descriptor as the id',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        const levels = resolveTrollRunLevels(descriptors, world)
        expect(
          levels.map((level) => level.id),
          `${world} seed ${seed}: ids must match the stored order`
        ).toEqual(descriptors)
        for (const level of levels) {
          expect(level.world, `${level.id}: world`).toBe(world)
          expect(level.parTime, `${level.id}: par time`).toBeGreaterThan(0)
        }
      }
    },
    ROUND_TIMEOUT_MS
  )

  it(
    'leaves no level in a round that cannot be finished',
    () => {
      for (const { world, seed, descriptors } of ROUNDS) {
        for (const level of resolveTrollRunLevels(descriptors, world)) {
          expect(checkTrollRunReachable(level).solvable, `${world} seed ${seed}: ${level.id} is a dead end`).toBe(true)
        }
      }
    },
    ROUND_TIMEOUT_MS
  )

  it('still resolves the plain-id orders that sessions created before generation hold', () => {
    const legacy = ['doors-03', 'doors-01', 'doors-10']
    const levels = resolveTrollRunLevels(legacy, 'doors')
    expect(levels.map((level) => level.id)).toEqual(legacy)
  })

  it('falls back to the world order when the stored order is empty or unreadable', () => {
    const authoredOrder = getWorldLevels('gravity').map((level) => level.id)
    expect(resolveTrollRunLevels([], 'gravity').map((level) => level.id)).toEqual(authoredOrder)
    expect(resolveTrollRunLevels(null, 'gravity').map((level) => level.id)).toEqual(authoredOrder)
    expect(resolveTrollRunLevels(['nope', 'pits:gen:1:2'], 'gravity').map((level) => level.id)).toEqual(authoredOrder)
  })

  it('skips the entries it cannot read and keeps the ones it can', () => {
    const levels = resolveTrollRunLevels(['doors-01', 'not-a-level', 'doors-02:m'], 'doors')
    expect(levels.map((level) => level.id)).toEqual(['doors-01', 'doors-02:m'])
  })
})
