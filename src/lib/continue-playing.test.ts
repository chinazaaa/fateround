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
    ['web', 'src/lib/active-games.ts'],
    ['mobile', 'apps/mobile/lib/active-games.ts'],
  ])('%s reads the shared endpoint', (_p, rel) => {
    // The hook owns the fetch, not the strips — see the "must not fight" block below, which
    // is the reason there is exactly one caller per platform.
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

/**
 * The continue strip and the public "live games" feed must not fight.
 *
 * A public game you HOST appears in both by default — once as "Continue playing · hosting" and
 * again as a discovery card inviting you to join a game you are already running. And on the
 * device you are actually playing on, the strip is noise: you are already there, and the local
 * Recent list covers it. Both rules are enforced through one shared source, because a division
 * this precise only reads cleanly if the two sides are looking at the same list.
 */
describe('continue strip vs the discovery feed', () => {
  const HOOKS = [
    ['web', 'src/lib/active-games.ts'],
    ['mobile', 'apps/mobile/lib/active-games.ts'],
  ] as const

  it.each(HOOKS)('%s hook separates "elsewhere" from "all"', (_p, rel) => {
    const src = code(rel)
    // `games` = other devices only (the strip). `codes` = everything (discovery exclusion).
    expect(src).toMatch(/codes: new Set\(/)
    expect(src, 'must filter the strip by what this device holds').toMatch(/heldOnThisDevice/)
  })

  it.each(HOOKS)('%s decides "this device" from local credentials, not a guess', (_p, rel) => {
    const src = code(rel)
    expect(src, 'a player resume token').toMatch(/getPlayerSession/)
    expect(src, 'or the host token — a host-only host has no player session').toMatch(/(readHostToken|getHostToken)/)
  })

  it('both strips render from the shared hook rather than fetching their own', () => {
    for (const rel of [
      'src/components/home/ContinuePlayingStrip.tsx',
      'apps/mobile/components/home/ContinuePlayingStrip.tsx',
    ]) {
      expect(code(rel)).toMatch(/useActiveGames\(\)/)
      expect(code(rel), 'no second fetch to drift from the exclusion list').not.toMatch(/fetch\(/)
    }
  })

  it('the web live-games strip excludes games you are in', () => {
    const src = code('src/components/LiveGamesStrip.tsx')
    expect(src).toMatch(/myActiveCodes\.has\(g\.id\.toUpperCase\(\)\)/)
    // Checked AFTER the filter: when every live game is one of yours the section must hide,
    // not render an empty grid under a "Live games" heading.
    expect(src.search(/const shown =/)).toBeLessThan(src.search(/shown\.length === 0\) return null/))
  })

  it('the mobile home preview excludes them, but the full browse page does not', () => {
    const src = code('apps/mobile/components/browse/BrowseGamesList.tsx')
    expect(src).toMatch(/previewLimit \? byType\.filter\(\(g\) => !myActiveCodes\.has/)
    // On /browse you came to look at what's live; your own game vanishing would read as a bug.
    expect(src).toMatch(/: byType/)
  })
})
