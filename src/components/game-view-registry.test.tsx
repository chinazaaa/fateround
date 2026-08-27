// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { PLAYER_VIEW_REGISTRY, PLAYER_VIEW_LOADERS } from './game-player-views'
import { HOST_VIEW_REGISTRY, HOST_VIEW_LOADERS } from './game-host-views'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'

// The views are code-split (see game-player-views.tsx), so importing the registries no longer
// pulls every view in. The last test here resolves every loader explicitly to keep what the
// static imports used to give for free: each view component builds a Supabase client at module
// load, so this still exercises the harness's dummy-Supabase env (without it, these imports
// throw "supabaseUrl is required") and still catches a view that fails to import at all.

// Poll-family games render via the shared PollGamePlayerExperience and are intentionally
// NOT in the per-game view registries. Every other game type must have both views.
const POLL_GAMES: GameType[] = [
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
]

describe('game view registries', () => {
  // GAME_TYPE_CONFIG is `Record<GameType, …>`, so its keys are the canonical full set.
  const allGameTypes = Object.keys(GAME_TYPE_CONFIG) as GameType[]

  it('player and host registries cover exactly the same games', () => {
    expect(Object.keys(PLAYER_VIEW_REGISTRY).sort()).toEqual(Object.keys(HOST_VIEW_REGISTRY).sort())
  })

  it('every game type is either a poll game or has a registered view (none left unwired)', () => {
    const registered = new Set(Object.keys(PLAYER_VIEW_REGISTRY))
    const poll = new Set<string>(POLL_GAMES)
    const uncovered = allGameTypes.filter((g) => !registered.has(g) && !poll.has(g))
    expect(uncovered, 'game types with neither a registered view nor a poll classification').toEqual([])
  })

  it('every registry entry is a defined component', () => {
    for (const v of [...Object.values(PLAYER_VIEW_REGISTRY), ...Object.values(HOST_VIEW_REGISTRY)]) {
      expect(v).toBeTruthy()
    }
  })

  it('every lazily-loaded view module resolves to a real component', async () => {
    const loaders = [...Object.entries(PLAYER_VIEW_LOADERS), ...Object.entries(HOST_VIEW_LOADERS)]
    expect(loaders.length).toBeGreaterThan(0)
    for (const [type, load] of loaders) {
      const View = await load()
      expect(View, `view for ${type} failed to load`).toBeTruthy()
    }
  }, 60_000)
})
