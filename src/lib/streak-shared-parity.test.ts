import { describe, it, expect } from 'vitest'
import { streakStatus as webStatus, watDate as webWatDate, daysBetween as webDaysBetween } from '@/lib/trophies/streak'
import {
  streakStatus as sharedStatus,
  watDate as sharedWatDate,
  daysBetween as sharedDaysBetween,
  streakIsAtRisk,
  streakNote,
  FREEZE_EARN_EVERY as SHARED_EARN_EVERY,
  FREEZE_MAX_HELD as SHARED_MAX_HELD,
} from '../../packages/shared/src/streak'
import { FREEZE_EARN_EVERY, FREEZE_MAX_HELD } from '@/lib/trophies/streak'

/**
 * The streak read helpers exist twice on purpose.
 *
 * Imported by RELATIVE path, not `@fateround/shared/streak`: the web app deliberately does not
 * take a dependency on the shared package (`src/lib/public-hints.ts`), and a test is not the
 * place to quietly add one. Same convention as `src/app/api/mobile-config/mobile-config.test.ts`.
 *
 * `advanceStreak` is server-side by design — it runs in the award pass against a server
 * timestamp, because a client-computed streak is a streak a device clock can buy. So the
 * engine stays in `src/lib/trophies/streak.ts` and only the READ half is mirrored into
 * `packages/shared` for the mobile app, which cannot import from `src/`.
 *
 * Deliberate duplication still drifts. This runs both copies over the same grid and fails on
 * the first disagreement, which is the failure that would actually hurt: a streak the phone
 * calls safe and the site calls lost.
 */

const DATES = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-06', '2026-09-01', 'garbage']

describe('shared streak helpers match the web engine', () => {
  it('agrees on the freeze constants', () => {
    expect(SHARED_EARN_EVERY).toBe(FREEZE_EARN_EVERY)
    expect(SHARED_MAX_HELD).toBe(FREEZE_MAX_HELD)
  })

  it('agrees on the WAT calendar date', () => {
    for (const iso of ['2026-08-01T23:30:00Z', '2026-08-01T22:30:00Z', '2026-01-01T00:00:00Z']) {
      expect(sharedWatDate(new Date(iso))).toBe(webWatDate(new Date(iso)))
    }
  })

  it('agrees on day arithmetic, junk included', () => {
    for (const from of DATES) {
      for (const to of DATES) {
        const a = sharedDaysBetween(from, to)
        const b = webDaysBetween(from, to)
        expect(Number.isNaN(a)).toBe(Number.isNaN(b))
        if (!Number.isNaN(a)) expect(a).toBe(b)
      }
    }
  })

  it('agrees on every standing across the whole grid', () => {
    let compared = 0
    for (const last_active_date of [...DATES, null]) {
      for (const current_streak of [0, 1, 7, 40]) {
        for (const streak_freezes of [0, 1, 2, 99, -1]) {
          for (const today of ['2026-08-02', '2026-08-05']) {
            const state = { current_streak, last_active_date, streak_freezes }
            expect(sharedStatus(state, today), JSON.stringify({ ...state, today })).toEqual(webStatus(state, today))
            compared++
          }
        }
      }
    }
    // Guards the loop itself — an empty grid would pass silently.
    expect(compared).toBe(320)
  })

  it('exposes the mobile-only conveniences the web side builds inline', () => {
    const atRisk = { current_streak: 5, last_active_date: '2026-08-01', streak_freezes: 0 }
    expect(streakIsAtRisk(atRisk)).toBe(sharedStatus(atRisk).standing === 'at_risk')
    expect(streakIsAtRisk(null)).toBe(false)

    expect(streakNote(atRisk, '2026-08-02')).toContain('5-day streak')
    // Nothing to say when the streak is safe or already gone.
    expect(streakNote({ ...atRisk, last_active_date: '2026-08-02' }, '2026-08-02')).toBeNull()
    expect(streakNote(atRisk, '2026-08-20')).toBeNull()
  })
})
