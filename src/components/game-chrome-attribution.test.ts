import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

/**
 * Both game chromes must actually RENDER the attribution components.
 *
 * This is not a style rule. Attribution is what links a player row to a profile, and the award
 * pass runs inside it — without it a player earns nothing at all: no trophies, no `games_played`,
 * no streak day. It lives in the chromes because the host page and the player page share no hook
 * (which is exactly why it moved out of `useGameSession` / `useGameViewBootstrap`).
 *
 * It has already failed once, and silently: a change added the IMPORT to `GamePlayerChrome`
 * without the JSX, so every non-hosting player stopped earning while hosts kept working. Nothing
 * errored, no test failed, and the import made it look wired. That is why this asserts the
 * rendered tag and not the import.
 */
const CHROMES = ['src/components/GameHostChrome.tsx', 'src/components/GamePlayerChrome.tsx']

const REQUIRED = [
  { tag: '<GameAttribution', why: 'links the player row to a profile and runs the award pass' },
  { tag: '<PostWinPrompt', why: 'the one moment anonymous players are asked to save progress' },
  { tag: '<TrophiesThisGame', why: 'the results-screen line for what this round earned' },
]

describe('game chromes render the attribution components', () => {
  for (const file of CHROMES) {
    const src = readFileSync(file, 'utf8')
    for (const { tag, why } of REQUIRED) {
      it(`${file} renders ${tag}> — ${why}`, () => {
        expect(src.includes(tag), `${file} does not render ${tag}>`).toBe(true)
      })
    }
  }
})
