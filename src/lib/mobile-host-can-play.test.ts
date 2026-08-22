import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard for "the host can watch their own game but not play it".
 *
 * A mobile host who taps "Play along" in the lobby and types a name holds a real seat — a
 * `players` row like anyone else. But `HostChrome` renders host-run games (trivia, bingo,
 * mafia, quick draw, …) as their control console, and that console is READ-ONLY: trivia's
 * printed the question and its four choices as plain `Text` with nothing to tap. Reported as
 * "I can't play on mobile — it's only showing the questions".
 *
 * ── WHY NOT A TAB ────────────────────────────────────────────────────────────
 * The first attempt at this fix added a Play/Manage toggle, which is precisely what the
 * comment it replaced ruled out: "no Play/Manage tab, so the drive controls are always in
 * reach". It also made every host-run game carry a control the app uses nowhere else, to solve
 * a problem only trivia had. The rule the app actually follows is simpler and already existed:
 * you play the game, and hosting tools live behind the ⚙ button.
 *
 * So the fix is one prop on one game. `playFirstWhenSeated` is only correct for a host-run game
 * that DRIVES ITSELF — trivia's rounds auto-advance when everyone answers or the clock expires,
 * with the server ticker behind that, so a seated trivia host has nothing to drive. Bingo's
 * manual caller and Mafia's phase advance are the hosting job, so those stay console-first.
 */

const MOBILE = join(process.cwd(), 'apps', 'mobile')
const read = (rel: string) => readFileSync(join(MOBILE, rel), 'utf8')
const CHROME = read('components/host/HostChrome.tsx')

describe('a seated mobile host can play a self-driving game', () => {
  it('trivia opts in, because trivia auto-advances', () => {
    expect(read('components/host/trivia/TriviaHostScreen.tsx')).toMatch(/playFirstWhenSeated/)
  })

  it('the flag only takes effect once the host holds a seat', () => {
    // Without `seated` a host-only host would lose the console they came for.
    expect(CHROME).toMatch(/const playFirstNow = playFirst \|\| \(playFirstWhenSeated && seated\)/)
  })

  it('a seated host of an opted-in game gets the play view', () => {
    expect(CHROME).toMatch(/const showPlayView = canPlay && \(playFirstNow \|\| \(finished && seated\)\)/)
  })

  it('an unseated host still gets the console', () => {
    expect(CHROME).toMatch(/const showConsole = !playFirstNow && !!children/)
  })

  it('games that must be driven by hand do NOT opt in', () => {
    // Bingo's caller and Mafia's phase advance ARE the hosting job — burying them behind the
    // gear would break the loop those games are played through.
    for (const rel of [
      'components/host/bingo/BingoHostScreen.tsx',
      'components/host/mafia/MafiaHostScreen.tsx',
      'components/host/quick-draw/QuickDrawHostScreen.tsx',
    ]) {
      expect(read(rel), `${rel} must stay console-first`).not.toMatch(/playFirstWhenSeated/)
    }
  })

  it('reintroduces no Play/Manage tab', () => {
    // The thing this fix is not. Kept as an assertion because it was already ruled out once and
    // still got added back.
    for (const marker of [/canToggleSurface/, /surfaceTab/, /'play', 'manage'/, /Play' : 'Manage'/]) {
      expect(CHROME, `Play/Manage tab reintroduced (${marker})`).not.toMatch(marker)
    }
  })
})
