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

  it('/profile no longer carries account settings inline', () => {
    const profile = code('app/profile.tsx')
    expect(profile, 'must link out instead of embedding').not.toMatch(/<AccountSettingsSection/)
    expect(profile).toMatch(/\/settings/)
  })

  it('the ProfileChip sheet no longer signs you out under another name', () => {
    const chip = code('components/profile/ProfileChip.tsx')
    expect(chip, '"Not you? Switch" was a third door to the same control').not.toMatch(/Not you\? Switch</)
    expect(chip).toMatch(/\/settings/)
  })
})
