import { describe, expect, it } from 'vitest'
import {
  ALL_TROLL_RUN_LEVELS,
  TROLL_RUN_WORLDS,
  WORLD_1_LEVELS,
  WORLD_2_LEVELS,
  WORLD_3_LEVELS,
  WORLD_4_LEVELS,
  WORLD_5_LEVELS,
  getWorldLevels,
} from './levels'
import { checkTrollRunReachable, trollRunDoorIsBuried, trollRunDoorPlacements } from './levels/reach'
import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TrollRunTileType,
  trollEntityIsActive,
} from './types'
import { TROLL_RUN_FAKE_DOOR_BITE_SECONDS } from '../troll-run-types'

describe('Troll Run Level Registry & Worlds', () => {
  it('contains exactly 5 worlds and 50 total levels', () => {
    expect(TROLL_RUN_WORLDS).toHaveLength(5)
    expect(WORLD_1_LEVELS).toHaveLength(10)
    expect(WORLD_2_LEVELS).toHaveLength(10)
    expect(WORLD_3_LEVELS).toHaveLength(10)
    expect(WORLD_4_LEVELS).toHaveLength(10)
    expect(WORLD_5_LEVELS).toHaveLength(10)
    expect(ALL_TROLL_RUN_LEVELS).toHaveLength(50)
  })

  it('correctly routes world levels via getWorldLevels', () => {
    expect(getWorldLevels('pits')).toBe(WORLD_1_LEVELS)
    expect(getWorldLevels('doors')).toBe(WORLD_2_LEVELS)
    expect(getWorldLevels('gravity')).toBe(WORLD_3_LEVELS)
    expect(getWorldLevels('gauntlet')).toBe(WORLD_4_LEVELS)
    expect(getWorldLevels('machines')).toBe(WORLD_5_LEVELS)
    expect(getWorldLevels(null)).toBe(WORLD_1_LEVELS)
  })

  it('ensures each of the 50 levels has valid geometry, spawn point, door, and par times', () => {
    const seenIds = new Set<string>()

    for (const lvl of ALL_TROLL_RUN_LEVELS) {
      // Unique ID
      expect(seenIds.has(lvl.id)).toBe(false)
      seenIds.add(lvl.id)

      expect(lvl.name).toBeTruthy()
      expect(lvl.world).toBeTruthy()
      expect(lvl.width).toBe(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.height).toBe(TROLL_RUN_INTERNAL_HEIGHT)

      // Spawn bounds
      expect(lvl.spawn.x).toBeGreaterThanOrEqual(0)
      expect(lvl.spawn.x).toBeLessThan(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.spawn.y).toBeGreaterThanOrEqual(0)
      expect(lvl.spawn.y).toBeLessThan(TROLL_RUN_INTERNAL_HEIGHT)

      // Door bounds
      expect(lvl.door.x).toBeGreaterThanOrEqual(0)
      expect(lvl.door.x).toBeLessThan(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.door.y).toBeGreaterThanOrEqual(0)
      expect(lvl.door.y).toBeLessThan(TROLL_RUN_INTERNAL_HEIGHT)

      // Grid dimensions (at least 11 rows x 20 cols)
      expect(lvl.tiles.length).toBeGreaterThanOrEqual(10)
      for (const row of lvl.tiles) {
        expect(row.length).toBe(20)
      }

      // Par time configured
      expect(lvl.parTime).toBeGreaterThan(0)
    }
  })

  it('leaves every door — including the ones traps move — inside the level and clear of geometry', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      for (const door of trollRunDoorPlacements(level)) {
        const where = `${level.id} (${door.origin})`

        expect(door.x, `${where}: door left edge`).toBeGreaterThanOrEqual(0)
        expect(door.x + TROLL_RUN_DOOR_WIDTH, `${where}: door right edge`).toBeLessThanOrEqual(TROLL_RUN_INTERNAL_WIDTH)
        expect(door.y, `${where}: door top edge`).toBeGreaterThanOrEqual(0)
        expect(door.y + TROLL_RUN_DOOR_HEIGHT, `${where}: door bottom edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_HEIGHT
        )

        expect(trollRunDoorIsBuried(level.tiles, door), `${where}: door is buried in solid tiles`).toBe(false)
      }
    }
  })

  // Reachability, not the harsher all-traps-sprung bar: several authored levels are deliberately
  // cleverer than that, and `checkTrollRunSolvable`'s own comment says so. What no authored level may
  // be is a dead end on its own layout — the fault "The Grand Chase" shipped with.
  it('gives every authored level a route from spawn to its final door position', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const verdict = checkTrollRunReachable(level)
      expect(verdict.solvable, `${level.id} (${level.name}) has no route to its door`).toBe(true)
      expect(verdict.seconds, `${level.id}: route is instant, so the door sits on the spawn`).toBeGreaterThan(0)
    }
  })

  it('keeps trigger zones and the tiles their actions address inside the grid', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
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

        // A trap that names a tile outside the grid silently does nothing, which reads in play as a
        // trap that never fires rather than as a level-authoring mistake.
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
            expect(level.tiles[row]?.[col], `${where}: ${action.type} targets a tile that exists`).not.toBeUndefined()
          }
        }
      })
    }
  })

  // World 5's machinery is threat and timing laid over a route the tiles already carry. The solver
  // reads entities as static geometry parked at their start position, so a level whose only way
  // through is catching a moving part would pass the route check above and still be a lie in play.
  // Stripping the machinery out entirely is what proves it never became the floor.
  it('keeps every authored level clearable with its moving machinery removed', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      if (!level.movingEntities || level.movingEntities.length === 0) continue

      const withoutMachinery = { ...level, movingEntities: [], tiles: level.tiles.map((row) => [...row]) }
      const verdict = checkTrollRunReachable(withoutMachinery)
      expect(verdict.solvable, `${level.id} (${level.name}) depends on machinery for its route`).toBe(true)
    }
  })

  // A bite that never expires is a level nobody can finish. `updatePlayerPhysics` turns door contact
  // lethal for exactly as long as the timer the engine counts down, so a zero or negative duration
  // would either do nothing or never end.
  it('gives every fake_door a positive bite duration', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      for (const trigger of level.triggers) {
        for (const action of trigger.actions) {
          if (action.type !== 'fake_door') continue
          const effectiveDuration = action.duration ?? TROLL_RUN_FAKE_DOOR_BITE_SECONDS
          expect(effectiveDuration, `${level.id}: fake_door bite must expire`).toBeGreaterThan(0)
        }
      }
    }
  })

  // `trollEntityIsActive` is the only thing standing between a pulsing hazard and the route solver,
  // which never advances a clock: a beam authored mid-cycle would read as parked-and-lethal, block
  // the route, and be reported as an unclearable level. Starting in the gap keeps the parked read
  // truthful — and it is also what gives the runner a look at the beat before it can kill them.
  it('starts every pulsing hazard in its gap, on a cycle that actually turns over', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      for (const entity of level.movingEntities ?? []) {
        if (!entity.pulse) continue
        const where = `${level.id} / ${entity.id}`

        expect(entity.pulse.onSeconds, `${where}: beam never lights`).toBeGreaterThan(0)
        expect(entity.pulse.offSeconds, `${where}: gap never opens`).toBeGreaterThan(0)
        expect(entity.pulseElapsed, `${where}: authored levels carry no runtime clock`).toBeUndefined()
        expect(trollEntityIsActive(entity), `${where}: hazard is live before anything has moved`).toBe(false)
      }
    }
  })

  /**
   * The fault "Elevator Pitch" and "Elevator Trap" shipped with. A zone big enough to stand on is
   * also big enough to fly through, so an `enter` collapse can take the platform the runner was
   * heading for away before they land on it, leaving a gap no jump covers. `checkTrollRunReachable`
   * reads the pristine grid and never runs a trigger, so it called both levels clearable.
   *
   * Only undelayed collapses are judged: a delay is itself the escape, and `land_on` cannot fire
   * until the runner is provably standing on the tiles it takes.
   */
  it('leaves a level clearable after any collapse that fires the moment its zone is entered', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      for (const trigger of level.triggers) {
        if (trigger.condition !== 'enter') continue

        const tiles = level.tiles.map((row) => [...row])
        let collapsedAnything = false

        for (const action of trigger.actions) {
          if (action.type !== 'collapse_tiles' || action.delay) continue
          for (const [col, row] of action.tiles) {
            if (tiles[row]?.[col] === undefined) continue
            tiles[row][col] = TrollRunTileType.EMPTY
            collapsedAnything = true
          }
        }

        if (!collapsedAnything) continue

        const verdict = checkTrollRunReachable({ ...level, tiles })
        expect(
          verdict.solvable,
          `${level.id} / ${trigger.id ?? 'trigger'}: entering the zone drops tiles the level cannot be finished ` +
            `without — give the collapse a delay to jump off inside, or gate it on 'land_on'`
        ).toBe(true)
      }
    }
  })
})
