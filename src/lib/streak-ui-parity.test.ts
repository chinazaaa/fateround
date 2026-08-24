import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: the streak is legible on both platforms, in the same places.
 *
 * Before this, the streak was write-only in the UI — a number and a flame with nothing to say
 * it was about to lapse, and a `streak_freezes` column that no surface on either platform ever
 * showed. A player could hold two freezes without knowing forgiveness existed, which is most
 * of what makes forgiveness worth having (`docs/trophies-and-streaks.md` §4.4–4.5).
 *
 * Two surfaces per platform: the profile screen (banner + freeze count) and the chip in the
 * header (a dimmed flame, the only room there is).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const SURFACES = [
  { platform: 'web', profile: 'src/app/profile/page.tsx', chip: 'src/components/profile/ProfileChip.tsx' },
  {
    platform: 'mobile',
    profile: 'apps/mobile/app/profile.tsx',
    chip: 'apps/mobile/components/profile/ProfileChip.tsx',
  },
]

describe.each(SURFACES)('$platform streak surfaces', ({ profile, chip }) => {
  it('the profile screen renders the at-risk banner', () => {
    expect(read(profile)).toMatch(/<Streak(StatusBanner|StatusCard)\s+profile=/)
  })

  it('the profile screen shows freezes held', () => {
    expect(read(profile), 'the freeze count must be visible somewhere').toMatch(/streak_freezes|freezes/)
  })

  it('the chip dims the flame when the streak is at risk', () => {
    const src = read(chip)
    expect(src).toMatch(/streakIsAtRisk\(/)
    expect(src, 'the dimmed state must actually reach the flame').toMatch(/atRisk/)
  })

  it('the chip tells a screen reader the streak needs attention', () => {
    // The visual cue is opacity, which a screen reader cannot convey.
    expect(read(chip)).toMatch(/play today to keep it/)
  })
})

describe('the at-risk components stay silent when there is nothing to say', () => {
  // A nudge about a streak that is already gone reads as a reprimand, and one about a streak
  // already secured today is noise. Both components must be able to render nothing.
  it.each(['src/components/profile/StreakStatusBanner.tsx', 'apps/mobile/components/profile/StreakStatusCard.tsx'])(
    '%s returns null when there is no note',
    (rel) => {
      expect(read(rel)).toMatch(/return null/)
    }
  )
})
