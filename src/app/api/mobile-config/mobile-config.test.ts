import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GET } from './route'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'
// Relative, not `@fateround/shared/...`: the web app deliberately does not take the shared
// package as a runtime dependency (see the note in src/lib/public-hints.ts). These modules
// are plain TS with type-only imports, so a test can read them directly without pulling
// React Native into the web build.
import { BATCH_2_POLL_GAMES } from '../../../../packages/shared/src/poll-games'
import { BATCH_3_GAMES } from '../../../../packages/shared/src/batch-3-games'
import { BATCH_4_GAMES } from '../../../../packages/shared/src/batch-4-games'
import { BATCH_5_GAMES } from '../../../../packages/shared/src/batch-5-games'
import { BATCH_6_GAMES } from '../../../../packages/shared/src/batch-6-games'
import { BATCH_7_GAMES } from '../../../../packages/shared/src/batch-7-games'
import { BATCH_8_GAMES } from '../../../../packages/shared/src/batch-8-games'
import { BATCH_9_GAMES } from '../../../../packages/shared/src/batch-9-games'
import { BATCH_10_GAMES } from '../../../../packages/shared/src/batch-10-games'
import { BATCH_12_GAMES } from '../../../../packages/shared/src/batch-12-games'

/**
 * Guard for the "server enables a game the app cannot render" gap.
 *
 * `/api/mobile-config` is the server-driven kill switch: the Expo app trusts
 * `mobileSupportedGames` to decide whether to open a game natively or fall back to the web,
 * with no App Store review needed to flip one. But the route hand-writes its batch lists as
 * string literals while the app builds `MOBILE_SUPPORTED_GAMES` from the shared
 * `batch-*-games` modules and its own view registry — two lists, no link. Drift had already
 * started (the route carries a `BATCH_11_GAMES` the app has no counterpart for), and drift
 * in the enabling direction ships a game to a client with no view for it.
 *
 * The route cannot simply import the app's list: `GameRouter.tsx` pulls in React Native, and
 * the web app deliberately does not depend on `@fateround/shared`. So the two stay separate
 * and this test is the link between them.
 */

const GAME_ROUTER = join(process.cwd(), 'apps', 'mobile', 'components', 'games', 'GameRouter.tsx')

/** Game types the Expo app actually has a player view for, read out of its registry. */
function mobilePlayerViewGameTypes(): Set<string> {
  const src = readFileSync(GAME_ROUTER, 'utf8')
  const types = new Set<string>()

  // Entries inside the *_VIEWS objects and MOBILE_PLAYER_VIEWS: `game_type: lazyView(…)` or
  // `game_type: SOME_VIEW,`. Anchored on the two-space indent those object literals use.
  for (const match of src.matchAll(/^ {2}([a-z][a-z0-9_]*):\s*(?:lazyView\(|[A-Z][A-Z0-9_]*,)/gm)) {
    types.add(match[1])
  }
  // The poll family is spread in from the shared list rather than written out per game.
  if (src.includes('...POLL_VIEWS')) for (const gameType of BATCH_2_POLL_GAMES) types.add(gameType)
  return types
}

/** The BATCH_1 literal the app declares inline (it predates the shared batch modules). */
function batch1FromApp(): string[] {
  const src = readFileSync(GAME_ROUTER, 'utf8')
  const block = src.match(/export const BATCH_1_GAMES: GameType\[\] = \[([^\]]*)\]/)
  expect(block, 'BATCH_1_GAMES not found in GameRouter.tsx — did it change shape?').not.toBeNull()
  return [...block![1].matchAll(/'([a-z_0-9]+)'/g)].map((match) => match[1])
}

const APP_SUPPORTED = new Set<string>([
  ...batch1FromApp(),
  ...BATCH_2_POLL_GAMES,
  ...BATCH_3_GAMES,
  ...BATCH_4_GAMES,
  ...BATCH_5_GAMES,
  ...BATCH_6_GAMES,
  ...BATCH_7_GAMES,
  ...BATCH_8_GAMES,
  ...BATCH_9_GAMES,
  ...BATCH_10_GAMES,
  ...BATCH_12_GAMES,
])

async function config() {
  return (await (await GET()).json()) as {
    minAppVersion: string
    mobileSupportedGames: GameType[]
    maintenanceMessage: string | null
    forceWebFallbackFor: GameType[]
  }
}

describe('/api/mobile-config', () => {
  it('enables only real game types', async () => {
    const { mobileSupportedGames } = await config()
    const known = new Set(Object.keys(GAME_TYPE_CONFIG))
    const bogus = mobileSupportedGames.filter((gameType) => !known.has(gameType))
    expect(bogus, 'enabled game type that does not exist').toEqual([])
  })

  it('lists each game once', async () => {
    const { mobileSupportedGames } = await config()
    const seen = new Set<string>()
    const dupes = mobileSupportedGames.filter((gameType) => !seen.add(gameType))
    expect(dupes).toEqual([])
  })

  it('enables nothing the app has no player view for', async () => {
    const { mobileSupportedGames } = await config()
    const views = mobilePlayerViewGameTypes()
    const unrenderable = mobileSupportedGames.filter((gameType) => !views.has(gameType))
    expect(
      unrenderable,
      'the server enables these but apps/mobile has no player view — the app would open a ' +
        'blank screen instead of falling back to web'
    ).toEqual([])
  })

  it('matches the app-side MOBILE_SUPPORTED_GAMES exactly', async () => {
    const { mobileSupportedGames } = await config()
    const serverOnly = mobileSupportedGames.filter((gameType) => !APP_SUPPORTED.has(gameType))
    const appOnly = [...APP_SUPPORTED].filter((gameType) => !mobileSupportedGames.includes(gameType as GameType))
    expect(serverOnly, 'enabled by the server but not in the app build').toEqual([])
    expect(appOnly, 'shipped in the app but never enabled by the server — dead native code').toEqual([])
  })

  it('force-fallback entries are real game types', async () => {
    const { forceWebFallbackFor, mobileSupportedGames } = await config()
    const known = new Set(Object.keys(GAME_TYPE_CONFIG))
    expect(forceWebFallbackFor.filter((gameType) => !known.has(gameType))).toEqual([])
    // A fallback for a game that was never enabled is a no-op that reads like a kill switch.
    const inert = forceWebFallbackFor.filter((gameType) => !mobileSupportedGames.includes(gameType))
    expect(inert, 'forced to web fallback but not enabled anyway — the entry does nothing').toEqual([])
  })

  it('reports a parseable minimum app version', async () => {
    const { minAppVersion } = await config()
    expect(minAppVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
