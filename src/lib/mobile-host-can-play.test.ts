import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: a seated mobile host plays the game, they don't watch a console of it.
 *
 * A host who taps "Play along" in the lobby holds a real seat — a `players` row like anyone
 * else. But `HostChrome` renders host-run games as their control console, and trivia's console
 * is READ-ONLY: it printed the question and its four choices as plain `Text` with nothing to
 * tap. Reported as "I can't play on mobile — it's only showing the questions".
 *
 * ── TWO CORRECTIONS THIS FILE RECORDS ────────────────────────────────────────
 * 1. The first fix added a Play/Manage toggle, which is exactly what the comment it replaced
 *    ruled out — "no Play/Manage tab, so the drive controls are always in reach" — and pushed
 *    a control onto every host-run game to solve a problem only trivia had.
 * 2. Its replacement test then asserted that Mafia and Quick Draw "must stay console-first".
 *    That was never checked, and it was false: both already pass `playFirst` and have done all
 *    along. The test PASSED anyway, because it only looked for the new prop name — a guard
 *    asserting a comfortable fiction.
 *
 * The real rule is one question: DOES THE GAME ADVANCE WITHOUT THE HOST? Verified against
 * `src/lib/game-tick.ts`, which is the authority on what the server drives.
 */

const MOBILE = join(process.cwd(), 'apps', 'mobile')
const read = (rel: string) => readFileSync(join(MOBILE, rel), 'utf8')
const CHROME = read('components/host/HostChrome.tsx')
const TICK = readFileSync(join(process.cwd(), 'src', 'lib', 'game-tick.ts'), 'utf8')

/** Either mechanism counts: the shared prop, or a hand-rolled `playFirst={isSeated}`. */
const playsWhenSeated = (src: string) =>
  /playFirstWhenSeated/.test(src) || /playFirst=\{isSeated\}/.test(src) || /playFirst\s*$/m.test(src)

describe('the server drives these games, so a seated host just plays', () => {
  // Each is poked by the ticker, so no host action is needed to move the game on.
  const SELF_DRIVING = [
    { game: 'trivia', screen: 'components/host/trivia/TriviaHostScreen.tsx', tick: /trivia: 'trivia'/ },
    {
      game: 'quick_draw',
      screen: 'components/host/quick-draw/QuickDrawHostScreen.tsx',
      tick: /quick_draw: 'quick-draw'/,
    },
    { game: 'mafia', screen: 'components/host/mafia/MafiaHostScreen.tsx', tick: /api\/mafia\/\$\{gameId\}\/advance/ },
  ]

  it.each(SELF_DRIVING)('$game is driven by the server ticker', ({ tick }) => {
    expect(TICK).toMatch(tick)
  })

  it.each(SELF_DRIVING)('$game gives a seated host the play view', ({ screen }) => {
    expect(playsWhenSeated(read(screen)), `${screen} leaves a seated host on a read-only console`).toBe(true)
  })
})

describe('bingo depends on how it is being called', () => {
  it('plays first only in auto-call mode', () => {
    // The ticker's bingo poke is a no-op in manual mode, so the host IS the clock there.
    expect(read('components/host/bingo/BingoHostScreen.tsx')).toMatch(
      /playFirstWhenSeated=\{game\.bingo_call_mode === 'auto'\}/
    )
  })

  it('keeps the manual caller on the console', () => {
    // "Call next number" is the whole hosting job in manual mode; behind the ⚙ it is unusable.
    expect(read('components/host/bingo/BingoHostScreen.tsx')).toMatch(/Call next number/)
  })
})

describe('HostChrome', () => {
  it('flips to play-first only while the host is actually PLAYING', () => {
    // Not merely "holds a row". The ⚙ sheet offers "Leave game (keep hosting)", which keeps the
    // host in the roster as a VIEWER so they can watch and still run the game. Keying on a bare
    // seat would strand them on a read-only player view afterwards, with the console — and
    // Force advance, which the ⚙ sheet does not carry — unreachable.
    expect(CHROME).toMatch(/const playFirstNow = playFirst \|\| \(playFirstWhenSeated && hostIsPlaying\)/)
    expect(CHROME).toMatch(/const hostIsPlaying = !!hostRow && !playerIsViewer\(hostRow, game\)/)
  })

  it('hands the console back to a host who stopped playing', () => {
    // The other half of the same rule: viewer row → not playing → console.
    expect(CHROME).toMatch(/showConsole = !playFirstNow/)
    expect(read('components/host/HostControlsSheet.tsx'), 'the control that creates that state').toMatch(
      /Leave game \(keep hosting\)/
    )
  })

  it('leaves an unseated host their console', () => {
    // They are running the game rather than playing it — Force advance and End game are the point.
    expect(CHROME).toMatch(/const showConsole = !playFirstNow && !!children/)
  })

  it('reintroduces no Play/Manage tab', () => {
    for (const marker of [/canToggleSurface/, /surfaceTab/, /'play', 'manage'/, /Play' : 'Manage'/]) {
      expect(CHROME, `Play/Manage tab reintroduced (${marker})`).not.toMatch(marker)
    }
  })
})
