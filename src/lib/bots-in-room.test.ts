import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BOT_TICK_SLUG, BOTS_SUPPORTED_TYPES, gameSupportsBots } from './bots-in-room'
import { pokeTargetFor } from './game-tick'
import { GAME_TYPE_CONFIG } from './game-types'

/**
 * Guard for "a host can seat a bot that nothing will ever move".
 *
 * Bots-in-room has three parts that must line up per game: the seat gate in
 * `/api/games/[code]/bots`, the ticker poke in `src/lib/game-tick.ts`, and the
 * driver + route that poke lands on. The first two can no longer drift — the seat gate
 * derives its set from `BOT_TICK_SLUG` — but nothing stops a slug being listed with no
 * route or driver behind it, which would seat a bot that silently never takes a turn and
 * stalls the room on its seat.
 *
 * `docs/bots-in-room-plan.md` names Ludo, Five Dice and the rest as future entries, so this
 * will be the check that catches a half-landed one.
 */

const ROOT = process.cwd()

describe('bots-in-room registry', () => {
  it('lists only real game types', () => {
    const known = new Set(Object.keys(GAME_TYPE_CONFIG))
    const bogus = Object.keys(BOT_TICK_SLUG).filter((gameType) => !known.has(gameType))
    expect(bogus, 'bot-enabled game type that does not exist').toEqual([])
  })

  it('covers the three shipped phases', () => {
    // Phase 1 Whot, Phase 2 Monopoly, Phase 3 Crazy Eights.
    expect(gameSupportsBots('whot')).toBe(true)
    expect(gameSupportsBots('monopoly')).toBe(true)
    expect(gameSupportsBots('crazy_eights')).toBe(true)
  })

  it('does not claim games whose bot driver has not shipped', () => {
    // Named in the plan as future work — a premature entry here is the bug.
    for (const gameType of ['ludo', 'yahtzee', 'ayo', 'uno']) {
      expect(gameSupportsBots(gameType), `${gameType} is not driven yet`).toBe(false)
    }
  })

  it('derives the seat gate from the ticker map, so the two cannot disagree', () => {
    expect([...BOTS_SUPPORTED_TYPES].sort()).toEqual(Object.keys(BOT_TICK_SLUG).sort())
  })

  it('every entry has a bot-tick route on disk', () => {
    const missing = Object.entries(BOT_TICK_SLUG)
      .filter(([, slug]) => !existsSync(join(ROOT, 'src', 'app', 'api', slug, 'bot-tick', 'route.ts')))
      .map(([gameType, slug]) => `${gameType} -> /api/${slug}/bot-tick`)
    expect(missing, 'the ticker would POST to a route that does not exist').toEqual([])
  })

  it('every entry has a driver and an adapter on disk', () => {
    // Slug, not game type: the files are named for the URL slug (crazy-eights, not
    // crazy_eights). Whot and Monopoly happen to match; Crazy Eights is the case that
    // proves the distinction matters.
    const missing: string[] = []
    for (const [gameType, slug] of Object.entries(BOT_TICK_SLUG)) {
      for (const suffix of ['bot-driver', 'bot-adapter']) {
        const file = join(ROOT, 'src', 'lib', `${slug}-${suffix}.ts`)
        if (!existsSync(file)) missing.push(`${gameType}: src/lib/${slug}-${suffix}.ts`)
      }
    }
    expect(missing, 'bot-enabled game with no driver/adapter — the bot would never move').toEqual([])
  })

  it('every bot-enabled game is also driven by the regular timer ticker', () => {
    // A bot game with no `pokeTargetFor` target would still move its bots but never expire a
    // HUMAN's lapsed turn, so the room would stall on the human instead.
    const unticked = Object.keys(BOT_TICK_SLUG).filter((gameType) => pokeTargetFor(gameType, 'ABCD') == null)
    expect(unticked, 'bot-enabled but absent from the timer ticker').toEqual([])
  })
})
