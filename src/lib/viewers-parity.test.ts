import { describe, it, expect } from 'vitest'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'
import {
  gameAllowsLatePlayerJoin as webAllowsLatePlayer,
  gameOffersLateJoinChoice as webOffersChoice,
  gameSupportsViewerSetting as webSupportsViewer,
} from '@/lib/viewers'
// Relative, not `@fateround/shared/...`: the web app deliberately does not take a dependency
// on the shared package, and a test is not the place to quietly add one. Same convention as
// `mobile-config.test.ts` and `streak-shared-parity.test.ts`.
import {
  gameAllowsLatePlayerJoin as sharedAllowsLatePlayer,
  gameOffersLateJoinChoice as sharedOffersChoice,
  gameSupportsViewerSetting as sharedSupportsViewer,
} from '../../packages/shared/src/viewers'

/**
 * The viewer/late-join rules exist twice — once for web, once in `packages/shared` for mobile —
 * and they had DRIFTED.
 *
 * The shared copy was missing Mafia, Draughts, Word Scramble, Troll Run and Anonymous Messages,
 * so mobile offered "join as player" in five games where web refuses it. That is the worst
 * possible shape of this bug: the promotion succeeds, the player is seated, and then there is
 * no seat or turn for them because turn order was fixed when the game started. Reported as
 * "they could convert but they couldn't play anything".
 *
 * These rules decide whether a control appears AND whether the resulting state is playable, so
 * a disagreement between platforms is never cosmetic.
 */
const ALL = Object.keys(GAME_TYPE_CONFIG) as GameType[]

describe('viewer rules match between web and the shared package', () => {
  it('has every game type to check', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(49)
  })

  it.each([
    ['gameAllowsLatePlayerJoin', webAllowsLatePlayer, sharedAllowsLatePlayer],
    ['gameOffersLateJoinChoice', webOffersChoice, sharedOffersChoice],
    ['gameSupportsViewerSetting', webSupportsViewer, sharedSupportsViewer],
  ] as const)('%s agrees for every game type', (_name, web, shared) => {
    const mismatches = ALL.filter((type) => web(type) !== shared(type as never))
    expect(mismatches, 'web and mobile would disagree about who can convert').toEqual([])
  })

  it('refuses a late player in games where a promoted one could not take a turn', () => {
    // The property behind the list is not "is it a puzzle" but "can someone arriving NOW take
    // part". Roles, seats and per-round rows for these are written in one pass at start, so a
    // late arrival holds a `players` row with nothing behind it: Mafia inserts every
    // `mafia_player_states` row (role AND permanent seat number) in `startMafiaGame`, and Troll
    // Run seeds every `troll_run_player_states` row in `initializeTrollRunGame`.
    for (const type of [
      'mafia',
      'checkers_international',
      'checkers_nigeria',
      'troll_run',
      'anonymous_messages',
    ] as GameType[]) {
      expect(webAllowsLatePlayer(type), `${type} must not allow late players`).toBe(false)
      expect(sharedAllowsLatePlayer(type as never), `${type} must not allow late players (shared)`).toBe(false)
    }
  })

  it('still allows conversion in the round-based games where it works', () => {
    // word_scramble belongs here, not above: it seeds no per-player state at start —
    // `word_scramble_solves` rows are upserted as each word is solved — so a late arrival just
    // starts solving with fewer banked. A disadvantage, not a broken seat.
    for (const type of ['trivia', 'bingo', 'quiplash', 'word_grouping', 'wordle_room', 'word_scramble'] as GameType[]) {
      expect(webAllowsLatePlayer(type), `${type} should allow late players`).toBe(true)
      expect(sharedAllowsLatePlayer(type as never)).toBe(true)
    }
  })
})
