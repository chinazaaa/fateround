import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: every mobile finish screen offers the notifications nudge, web does too.
 *
 * Web mounts `PublicGameFinishOverlay` on the shared `/game/[code]` route, so the
 * "want a ping when new <game> games open?" card (or "you're subscribed — see all
 * preferences" if they already are) appears for every game and every role.
 *
 * Mobile had the same card, but only inside `GameFinishPanel` — the PLAYER finish screen.
 * A host watching their own trivia game end got the console's finished controls and no
 * prompt at all. Both mobile finish surfaces need it, and neither may show two.
 */

const MOBILE = join(process.cwd(), 'apps', 'mobile')
const read = (rel: string) => readFileSync(join(MOBILE, rel), 'utf8')

describe('mobile finish screens offer the notifications nudge', () => {
  it('the player finish panel renders it', () => {
    expect(read('components/lifecycle/GameFinishPanel.tsx')).toMatch(/<PostJoinSubscribeNudge/)
  })

  it('the host console renders it when the game is over', () => {
    const chrome = read('components/host/HostChrome.tsx')
    expect(chrome, 'a host-only host never sees GameFinishPanel').toMatch(/<PostJoinSubscribeNudge/)
    // Only when finished, and only when the console is the surface on screen — the play
    // view brings GameFinishPanel's own copy, so an ungated mount would double it.
    expect(chrome).toMatch(/finished && !showPlayView \? <PostJoinSubscribeNudge/)
  })

  it('mobile matches web on both copy branches', () => {
    const nudge = read('components/notifications/PostJoinSubscribeNudge.tsx')
    const overlay = readFileSync(
      join(process.cwd(), 'src', 'components', 'notifications', 'PublicGameFinishOverlay.tsx'),
      'utf8'
    )
    for (const src of [nudge, overlay]) {
      expect(src, 'the not-yet-subscribed ask').toMatch(/Want a ping when new/)
      expect(src, 'the already-subscribed branch').toMatch(/See all notification preferences/)
      expect(src, 'the secondary jump to the full list').toMatch(/See all notifications/)
      expect(src, 'both probe /api/notifications to pick a branch').toMatch(/subscribedGameTypes/)
    }
  })
})
