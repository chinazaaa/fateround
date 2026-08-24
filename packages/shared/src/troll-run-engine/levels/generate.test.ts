import { describe, expect, it } from 'vitest'
import {
  TROLL_RUN_PLAIN_ATTEMPT,
  findFairTrollRunAttempt,
  generateTrollRunLevel,
  isFairTrollRunLevel,
} from './generate'
import { isStandableSpot, trollRunDoorIsBuried, trollRunDoorPlacements } from './reach'
import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_LEVELS_PER_ROUND,
  TROLL_RUN_PHYSICS,
  TROLL_RUN_TILE_SIZE,
  TROLL_RUN_WORLD_IDS,
  type TrollRunLevel,
  type TrollRunWorldId,
} from '../types'

/**
 * Seeds to sweep. Generation runs the physics solver once per attempt, so a wide sweep is slow —
 * these are enough to cover every shape and every trap recipe in all four palettes, and the sweep
 * carries its own timeout because vitest's five-second default is nowhere near it.
 */
const SEEDS = Array.from({ length: 8 }, (_unused, index) => 1_000 + index * 7_919)
const SWEEP_TIMEOUT_MS = 600_000

const SLOTS = Array.from({ length: TROLL_RUN_LEVELS_PER_ROUND }, (_unused, slot) => slot)

interface SweepRow {
  world: TrollRunWorldId
  slot: number
  seed: number
  attempt: number
  level: TrollRunLevel
}

/**
 * Every (world, slot, seed) the sweep covers, generated at the attempt the round recipe would pick.
 * Built once and shared: choosing the attempt is the expensive half of generation, and repeating it
 * per assertion would multiply the sweep's cost by the number of tests rather than the work.
 */
const SWEEP: SweepRow[] = (() => {
  const rows: SweepRow[] = []
  for (const world of TROLL_RUN_WORLD_IDS) {
    for (const slot of SLOTS) {
      for (const seed of SEEDS) {
        const attempt = findFairTrollRunAttempt(world, seed, slot)
        const id = `${world}:gen:${seed}:${slot}:${attempt}`
        rows.push({ world, slot, seed, attempt, level: generateTrollRunLevel({ id, world, seed, slot, attempt }) })
      }
    }
  }
  return rows
})()

describe('generateTrollRunLevel', () => {
  it(
    'builds a full-size grid for every world, slot and seed',
    () => {
      for (const { level } of SWEEP) {
        expect(level.width, `${level.id}: width`).toBe(TROLL_RUN_INTERNAL_WIDTH)
        expect(level.height, `${level.id}: height`).toBe(TROLL_RUN_INTERNAL_HEIGHT)
        expect(level.tiles, `${level.id}: rows`).toHaveLength(TROLL_RUN_GRID_ROWS)
        for (const row of level.tiles) {
          expect(row, `${level.id}: columns`).toHaveLength(TROLL_RUN_GRID_COLS)
        }
        expect(level.name, `${level.id}: name`).toBeTruthy()
        expect(level.world, `${level.id}: world`).toBe(level.id.split(':')[0])
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'starts the runner on ground that will hold them',
    () => {
      for (const { level } of SWEEP) {
        const col = Math.floor((level.spawn.x + TROLL_RUN_PHYSICS.PLAYER_WIDTH / 2) / TROLL_RUN_TILE_SIZE)
        const supportRow = Math.floor((level.spawn.y + TROLL_RUN_PHYSICS.PLAYER_HEIGHT) / TROLL_RUN_TILE_SIZE)

        expect(level.spawn.x, `${level.id}: spawn left edge`).toBeGreaterThanOrEqual(0)
        expect(level.spawn.x + TROLL_RUN_PHYSICS.PLAYER_WIDTH, `${level.id}: spawn right edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_WIDTH
        )
        expect(level.spawn.y, `${level.id}: spawn top edge`).toBeGreaterThanOrEqual(0)

        // The spawn drops a short way onto its platform, so the tile under the landing is what matters.
        const landingRow = Math.min(supportRow + 1, TROLL_RUN_GRID_ROWS - 1)
        const standsSomewhere =
          isStandableSpot(level.tiles, col, supportRow) || isStandableSpot(level.tiles, col, landingRow)
        expect(standsSomewhere, `${level.id}: nothing under the spawn at col ${col}`).toBe(true)
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'keeps every door the level can present inside the room and clear of geometry',
    () => {
      for (const { level } of SWEEP) {
        for (const door of trollRunDoorPlacements(level)) {
          const where = `${level.id} (${door.origin})`
          expect(door.x, `${where}: door left edge`).toBeGreaterThanOrEqual(0)
          expect(door.x + TROLL_RUN_DOOR_WIDTH, `${where}: door right edge`).toBeLessThanOrEqual(
            TROLL_RUN_INTERNAL_WIDTH
          )
          expect(door.y, `${where}: door top edge`).toBeGreaterThanOrEqual(0)
          expect(door.y + TROLL_RUN_DOOR_HEIGHT, `${where}: door bottom edge`).toBeLessThanOrEqual(
            TROLL_RUN_INTERNAL_HEIGHT
          )
          expect(trollRunDoorIsBuried(level.tiles, door), `${where}: door is buried`).toBe(false)
        }
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'addresses only tiles and zones that exist',
    () => {
      for (const { level } of SWEEP) {
        level.triggers.forEach((trigger, triggerIndex) => {
          const where = `${level.id} / ${trigger.id ?? `trigger #${triggerIndex}`}`

          expect(trigger.zone.w, `${where}: zone width`).toBeGreaterThan(0)
          expect(trigger.zone.h, `${where}: zone height`).toBeGreaterThan(0)
          expect(trigger.zone.x, `${where}: zone left edge`).toBeGreaterThanOrEqual(0)
          expect(trigger.zone.x + trigger.zone.w, `${where}: zone right edge`).toBeLessThanOrEqual(
            TROLL_RUN_INTERNAL_WIDTH
          )
          expect(trigger.zone.y, `${where}: zone top edge`).toBeGreaterThanOrEqual(0)
          expect(trigger.zone.y + trigger.zone.h, `${where}: zone bottom edge`).toBeLessThanOrEqual(
            TROLL_RUN_INTERNAL_HEIGHT
          )

          for (const action of trigger.actions) {
            const addressedTiles =
              action.type === 'collapse_tiles'
                ? action.tiles
                : action.type === 'spawn_spikes'
                  ? action.positions
                  : action.type === 'ice_floor'
                    ? action.tiles
                    : []

            for (const [col, row] of addressedTiles) {
              expect(col, `${where}: ${action.type} column`).toBeGreaterThanOrEqual(0)
              expect(col, `${where}: ${action.type} column`).toBeLessThan(TROLL_RUN_GRID_COLS)
              expect(row, `${where}: ${action.type} row`).toBeGreaterThanOrEqual(0)
              expect(row, `${where}: ${action.type} row`).toBeLessThan(TROLL_RUN_GRID_ROWS)
            }
          }
        })
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'ships nothing the solver has not signed off on',
    () => {
      for (const { level } of SWEEP) {
        expect(isFairTrollRunLevel(level), `${level.id} (${level.name}) is not clearable`).toBe(true)
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it('never has to fall back to the plain room', () => {
    // The plain room is the backstop for a seed the palette cannot satisfy. It is a real level, so a
    // fallback is not a failure — but if the sweep starts hitting it, the palette has stopped working.
    const fallbacks = SWEEP.filter((row) => row.attempt >= TROLL_RUN_PLAIN_ATTEMPT)
    expect(fallbacks.map((row) => row.level.id)).toEqual([])
  })

  it('ramps difficulty across the round, so slot ten asks more than slot one', () => {
    for (const world of TROLL_RUN_WORLD_IDS) {
      const parBySlot = SLOTS.map(
        (slot) =>
          SWEEP.find((row) => row.world === world && row.slot === slot && row.seed === SEEDS[0])?.level.parTime ?? 0
      )

      for (let slot = 1; slot < parBySlot.length; slot += 1) {
        expect(parBySlot[slot], `${world}: par time went backwards at slot ${slot}`).toBeGreaterThanOrEqual(
          parBySlot[slot - 1]
        )
      }
      expect(parBySlot[parBySlot.length - 1], `${world}: the round does not get harder`).toBeGreaterThan(parBySlot[0])
    }
  })

  it(
    'rebuilds the identical level from the same descriptor, which is what keeps clients in step',
    () => {
      for (const { world, slot, seed, attempt, level } of SWEEP) {
        const rebuilt = generateTrollRunLevel({ id: level.id, world, seed, slot, attempt })
        expect(rebuilt, `${level.id} did not rebuild identically`).toEqual(level)
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'gives different seeds different rooms, which is the whole point',
    () => {
      for (const world of TROLL_RUN_WORLD_IDS) {
        const grids = new Set(SWEEP.filter((row) => row.world === world).map((row) => JSON.stringify(row.level.tiles)))
        // Gravity is the narrowest palette — one corridor shape — so the bar is "more than a handful",
        // not "all distinct".
        expect(grids.size, `${world} produces too few distinct rooms`).toBeGreaterThan(5)
      }
    },
    SWEEP_TIMEOUT_MS
  )

  it('builds the plain room for an attempt past the last real one', () => {
    const plain = generateTrollRunLevel({
      id: 'pits:gen:4242:9:5',
      world: 'pits',
      seed: 4242,
      slot: 9,
      attempt: TROLL_RUN_PLAIN_ATTEMPT,
    })

    // No traps at all, and an unbroken floor: it cannot be unwinnable, which is the point of it.
    expect(plain.triggers).toEqual([])
    expect(isFairTrollRunLevel(plain)).toBe(true)
  })

  it('clamps a slot outside the round rather than reading past the ramp', () => {
    for (const slot of [-3, TROLL_RUN_LEVELS_PER_ROUND + 4]) {
      const level = generateTrollRunLevel({ id: `pits:gen:99:${slot}:0`, world: 'pits', seed: 99, slot, attempt: 0 })
      expect(level.parTime, `slot ${slot}: par time`).toBeGreaterThan(0)
      expect(level.tiles, `slot ${slot}: rows`).toHaveLength(TROLL_RUN_GRID_ROWS)
    }
  })
})
