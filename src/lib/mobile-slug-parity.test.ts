import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GAME_TYPE_TO_SLUG } from './game-landing'
import { GAME_TYPE_CONFIG } from './game-types'
import type { GameType } from '@/types'

/**
 * Guard for the mobile copy of the landing-slug map.
 *
 * `apps/mobile/lib/game-rules.ts` keeps its own `GAME_TYPE_TO_SLUG` — the app can't import
 * the web one (see the note in src/lib/public-hints.ts) — and it builds the "Rules" link
 * every mobile lobby shows: `{WEB_BASE_URL}/games/<slug>#rules`. A missing entry gives a
 * broken link for a game the app happily runs, and a stale entry sends players through a
 * redirect (or to a 404 once the alias is retired).
 *
 * Both had happened: Wordle and Troll Run were absent entirely — enough to fail the mobile
 * typecheck, which is not in CI, so it went unnoticed — and Estate Kings still pointed at
 * the pre-rename `monopoly` slug.
 *
 * The web map is the source of truth; this asserts the mobile copy tracks it exactly.
 */

const MOBILE_GAME_RULES = join(process.cwd(), 'apps', 'mobile', 'lib', 'game-rules.ts')

function mobileSlugMap(): Record<string, string> {
  const src = readFileSync(MOBILE_GAME_RULES, 'utf8')
  const block = src.match(/GAME_TYPE_TO_SLUG: Record<GameType, string> = \{([\s\S]*?)\n\}/)
  expect(block, 'GAME_TYPE_TO_SLUG not found in apps/mobile/lib/game-rules.ts — did it move?').not.toBeNull()
  return Object.fromEntries([...block![1].matchAll(/^\s*([a-z_0-9]+):\s*'([a-z0-9-]+)'/gm)].map((m) => [m[1], m[2]]))
}

describe('mobile landing-slug map tracks the web one', () => {
  const mobile = mobileSlugMap()
  const allGameTypes = Object.keys(GAME_TYPE_CONFIG) as GameType[]

  it('parses a map worth checking', () => {
    expect(Object.keys(mobile).length).toBe(allGameTypes.length)
  })

  it('covers every game type', () => {
    const missing = allGameTypes.filter((gameType) => !(gameType in mobile))
    expect(missing, 'no rules slug on mobile — the in-lobby Rules link would be broken').toEqual([])
  })

  it('uses the same slug as the web landing map', () => {
    const mismatched = allGameTypes
      .filter((gameType) => mobile[gameType] && mobile[gameType] !== GAME_TYPE_TO_SLUG[gameType])
      .map((gameType) => `${gameType}: mobile '${mobile[gameType]}' vs web '${GAME_TYPE_TO_SLUG[gameType]}'`)
    expect(mismatched, 'stale slug on mobile — the Rules link redirects, or 404s once the alias goes').toEqual([])
  })

  it('has no entry for a game type that no longer exists', () => {
    const known = new Set<string>(allGameTypes)
    const orphans = Object.keys(mobile).filter((gameType) => !known.has(gameType))
    expect(orphans, 'mobile slug map names a retired game type').toEqual([])
  })
})
