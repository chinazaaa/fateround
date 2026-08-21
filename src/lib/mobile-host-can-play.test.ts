import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard for "the host can watch their own game but not play it".
 *
 * A mobile host who taps "Play along" in the lobby and types a name holds a real seat — they
 * are a `players` row like anyone else. But for HOST-RUN games (trivia, bingo, mafia, quick
 * draw, …) `HostChrome` rendered only the control console once the game started, and that
 * console is read-only: it printed the trivia question and its four choices as plain `Text`
 * with nothing to tap. Reported as "I can't play on mobile — it's only showing the questions".
 *
 * The fix is a Play/Manage toggle. Two properties keep it correct, and both are pinned here:
 *   1. A seated host on a host-run game can reach the play view at all.
 *   2. The console stays MOUNTED while they play — several games drive themselves from hooks
 *      that live in it (bingo's caller, trivia's auto-advance), so unmounting the console
 *      would stop the game the host is playing.
 */

const CHROME = readFileSync(join(process.cwd(), 'apps', 'mobile', 'components', 'host', 'HostChrome.tsx'), 'utf8')

describe('mobile host of a host-run game can play along', () => {
  it('offers the toggle exactly when the host holds a seat on a host-run game', () => {
    // Not `playFirst` (those already show the board), seated, and there is a console to
    // switch back to. Drop any one of these and the toggle is either useless or misleading.
    expect(CHROME).toMatch(/const canToggleSurface =[^\n]*canPlay[^\n]*!playFirst[^\n]*seated[^\n]*children/)
  })

  it('the play view is reachable from the toggle, not only when the game is finished', () => {
    const line = /const showPlayView = [^\n]+/.exec(CHROME)?.[0] ?? ''
    expect(line, 'showPlayView must honour the toggle').toMatch(/canToggleSurface && surface === 'play'/)
    // The pre-toggle behaviours both survive: play-along games, and a seated host at the end.
    expect(line).toMatch(/playFirst/)
    expect(line).toMatch(/finished && seated/)
  })

  it('hides the console with display:none rather than unmounting it', () => {
    // The whole point: bingo's caller and trivia's auto-advance live in the console subtree.
    expect(CHROME, 'needs a style that hides without unmounting').toMatch(/hidden:\s*\{\s*display:\s*'none'\s*\}/)
    expect(CHROME, 'the console ScrollView must switch style, not render conditionally').toMatch(
      /style=\{showManageView \? styles\.manageBody : styles\.hidden\}/
    )
  })

  it('both tabs are labelled and reachable', () => {
    expect(CHROME).toMatch(/'play', 'manage'/)
    expect(CHROME).toMatch(/setSurface\(key\)/)
  })
})
