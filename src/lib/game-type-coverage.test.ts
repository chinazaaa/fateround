import { describe, it, expect } from 'vitest'
import { GAME_TYPE_CONFIG, GAME_TYPE_OPTIONS, gameTypeConfig, parseGameType } from './game-types'
import { GAME_TYPE_TO_SLUG, GAME_LANDING_CONTENT } from './game-landing'
import { GAME_LANDING_RULES } from './game-landing-rules'
import { createGameSchema } from './validation'
import type { GameType } from '@/types'

// GAME_TYPE_CONFIG is `Record<GameType, …>`, so its keys are the compiler-enforced,
// complete list of every game type. Use it as the single source of truth and assert
// the *hand-maintained* lists (GAME_TYPE_OPTIONS, validation's gameTypeEnum) and the
// per-game surfaces stay in sync — i.e. fail CI when a new game is only half-wired.
const ALL_GAME_TYPES = Object.keys(GAME_TYPE_CONFIG) as GameType[]

describe('game-type coverage (fail-fast guard for a half-wired game)', () => {
  it('has a non-trivial canonical list', () => {
    expect(ALL_GAME_TYPES.length).toBeGreaterThanOrEqual(30)
  })

  it('every game type is offered in GAME_TYPE_OPTIONS', () => {
    const offered = new Set(GAME_TYPE_OPTIONS)
    expect(ALL_GAME_TYPES.filter((g) => !offered.has(g))).toEqual([])
  })

  it('parseGameType round-trips every game type', () => {
    for (const g of ALL_GAME_TYPES) expect(parseGameType(g)).toBe(g)
  })

  it('every game type resolves to a config with a label', () => {
    for (const g of ALL_GAME_TYPES) {
      const cfg = gameTypeConfig(g)
      expect(cfg.id, g).toBe(g)
      expect(cfg.label?.length, `${g} label`).toBeGreaterThan(0)
    }
  })

  it('every game type has a landing slug, content and rules', () => {
    for (const g of ALL_GAME_TYPES) {
      expect(GAME_TYPE_TO_SLUG[g], `slug ${g}`).toBeTruthy()
      expect(GAME_LANDING_CONTENT[g], `content ${g}`).toBeTruthy()
      expect(GAME_LANDING_RULES[g]?.length, `rules ${g}`).toBeGreaterThan(0)
    }
  })

  it('createGameSchema (validation gameTypeEnum) accepts every game type', () => {
    const rejected = ALL_GAME_TYPES.filter((g) => !createGameSchema.safeParse({ title: 'x', game_type: g }).success)
    expect(rejected, 'rejected by createGameSchema — gameTypeEnum has drifted').toEqual([])
  })
})
