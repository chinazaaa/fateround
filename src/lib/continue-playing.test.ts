import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: the cross-device handoff strip stays cross-device.
 *
 * Everything that remembered a game before this was LOCAL to the device that played it —
 * mobile's recent list reads SecureStore, web's reads localStorage. So a game started on a
 * phone was invisible on a laptop signed into the same account, and the only way across was
 * retyping the code. The whole value of this strip is that it is the one list keyed on the
 * PROFILE rather than the device.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const ROUTE = 'src/app/api/profile/active-games/route.ts'

describe('active-games endpoint', () => {
  const src = code(ROUTE)

  it('is keyed on the profile, not the device', () => {
    expect(src).toMatch(/getProfileFromRequest\(req\)/)
    expect(src, 'games this profile hosts').toMatch(/eq\('host_user_id', profileId\)/)
    expect(src, 'games this profile plays in').toMatch(/eq\('user_id', profileId\)/)
  })

  it('returns only resumable games', () => {
    // A finished game belongs in history, not in a continue strip.
    expect(src).toMatch(/LIVE_STATUSES = \['waiting', 'active'\]/)
    expect(src).toMatch(/\.in\('status', LIVE_STATUSES\)/)
  })

  it('prefers the host role when someone both hosts and plays', () => {
    // Hosting is the surface that can actually run the game, so it must win the dedupe —
    // which means the host pass has to come second.
    // Match the object literals the passes BUILD (trailing comma), not the `role:` union in
    // the type above them — an earlier version of this assertion matched the type and compared
    // it against itself.
    const seatPass = src.search(/role: 'player',/)
    const hostPass = src.search(/role: 'host',/)
    expect(seatPass).toBeGreaterThan(-1)
    expect(hostPass).toBeGreaterThan(seatPass)
  })

  it('answers a guest with an empty list rather than an error', () => {
    expect(src).toMatch(/if \(!profileId\) return NextResponse\.json\(\{ games: \[\] \}\)/)
  })
})

describe('the strip on both platforms', () => {
  const WEB = 'src/components/home/ContinuePlayingStrip.tsx'
  const MOBILE = 'apps/mobile/components/home/ContinuePlayingStrip.tsx'

  it.each([
    ['web', WEB],
    ['mobile', MOBILE],
  ])('%s reads the shared endpoint', (_p, rel) => {
    expect(code(rel)).toMatch(/\/api\/profile\/active-games/)
  })

  it.each([
    ['web', WEB],
    ['mobile', MOBILE],
  ])('%s routes a host and a player to different places', (_p, rel) => {
    const src = code(rel)
    expect(src, 'host resumes into the host route, which reclaims the token').toMatch(/host\/\$\{game\.code\}/)
    expect(src, 'player resumes into the game route, which continues the seat').toMatch(/game\/\$\{game\.code\}/)
  })

  it.each([
    ['web', WEB],
    ['mobile', MOBILE],
  ])('%s renders nothing when there is nothing live', (_p, rel) => {
    // An empty "Continue playing" heading is worse than no heading, and it sits above the fold.
    expect(code(rel)).toMatch(/if \(games\.length === 0\) return null/)
  })

  it('sits above the local Recent list on mobile', () => {
    // Cross-device and live beats a list this phone happens to remember.
    const home = code('apps/mobile/app/index.tsx')
    // The section HEADING, not the `recent` state variable that is declared far above it.
    expect(home.search(/<ContinuePlayingStrip/)).toBeLessThan(home.search(/sectionTitle}>Recent</))
  })
})
