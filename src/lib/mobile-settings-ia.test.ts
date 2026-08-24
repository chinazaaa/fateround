import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: settings has ONE door on mobile.
 *
 * It used to have three, none of them named Settings — device preferences in the Home ⚙ sheet,
 * account settings at the bottom of `/profile` (below the per-game trophy list, so sign-out
 * drifted further the more you played), and identity behind "Not you? Switch" in the
 * ProfileChip sheet. Two of those sat side by side in the same top bar opening different
 * things. The device/account split is real and worth keeping; expecting a player to know it
 * BEFORE they go looking is what broke. See `docs/mobile-ia-audit-2026-08.md`.
 */

const MOBILE = join(process.cwd(), 'apps', 'mobile')
const read = (rel: string) => readFileSync(join(MOBILE, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('mobile settings has one destination', () => {
  it('/settings carries BOTH halves', () => {
    const screen = code('app/settings.tsx')
    expect(screen, 'account settings').toMatch(/<AccountSettingsSection/)
    expect(screen, 'device preferences').toMatch(/<DevicePreferencesSection/)
  })

  it('the Home gear opens the screen, not a sheet', () => {
    expect(code('app/index.tsx')).toMatch(/<SettingsButton variant="screen"/)
  })

  it('the in-game gear keeps the sheet', () => {
    // Navigating out of a live round to change the volume is the wrong trade, so the shell's
    // gear stays a sheet — the one place the two behaviours should differ.
    expect(code('components/session/PlayerSessionShell.tsx')).toMatch(/<SettingsButton \/>/)
  })

  it('the sheet and the screen render the SAME device controls', () => {
    // Two copies of an appearance picker would drift. Both must go through the extracted one.
    expect(code('components/ui/SettingsSheet.tsx')).toMatch(/<DevicePreferencesSection \/>/)
  })

  it('/profile no longer carries account settings inline, but still reaches them', () => {
    const profile = code('app/profile.tsx')
    expect(profile, 'must link out instead of embedding').not.toMatch(/<AccountSettingsSection/)
    // A gear in the top bar rather than an inline row: reachable from every tab, and it can't
    // be pushed off-screen by a long per-game list the way the old inline section was.
    expect(profile).toMatch(/<SettingsButton variant="screen"/)
  })

  it('/profile splits its content into tabs instead of one long scroll', () => {
    const profile = code('app/profile.tsx')
    expect(profile).toMatch(/\['trophies', 'stats'\] as const/)
    expect(profile, 'the Stats surface mobile never had').toMatch(/<ProfileStatsTab/)
  })

  it('the Stats tab reads the same history endpoint as web', () => {
    // Two platforms disagreeing about what someone played would be worse than not shipping it.
    expect(code('components/profile/ProfileStatsTab.tsx')).toMatch(/\/api\/profile\/history/)
    expect(readFileSync(join(process.cwd(), 'src', 'components', 'profile', 'StatsTab.tsx'), 'utf8')).toMatch(
      /\/api\/profile\/history/
    )
  })

  it('the ProfileChip sheet no longer signs you out under another name', () => {
    const chip = code('components/profile/ProfileChip.tsx')
    expect(chip, '"Not you? Switch" was a third door to the same control').not.toMatch(/Not you\? Switch</)
    expect(chip).toMatch(/\/settings/)
  })
})

/**
 * Home is ordered around intent, not around what was added when.
 *
 * A returning player's own games used to sit BELOW a five-item browse preview — the
 * highest-intent block on the screen, last. And the four primary actions were full-width
 * stacked rows, putting a screen height between the join card and anything personalised.
 */
describe('mobile home ordering', () => {
  const HOME = code('app/index.tsx')
  const at = (needle: string | RegExp) => HOME.search(needle instanceof RegExp ? needle : new RegExp(needle))

  it('puts the join card first — it is the front door', () => {
    expect(at('Join a game')).toBeGreaterThan(-1)
    expect(at('Join a game')).toBeLessThan(at('<YourUpcomingGamesStrip'))
  })

  it('puts personalised blocks above discovery', () => {
    const upcoming = at('<YourUpcomingGamesStrip')
    const recent = at('Recent')
    const browse = at('<BrowseGamesList')
    for (const [name, pos] of [
      ['upcoming', upcoming],
      ['recent', recent],
    ] as const) {
      expect(pos, `${name} must come before the browse preview`).toBeGreaterThan(-1)
      expect(pos).toBeLessThan(browse)
    }
  })

  it('uses a grid for the secondary actions, not full-width rows', () => {
    expect(HOME).toMatch(/actionGrid/)
    expect(HOME, 'Create stays full-width — it is the only one that makes something').toMatch(
      /label="Create a game"[\s\S]{0,120}?fullWidth/
    )
  })
})
