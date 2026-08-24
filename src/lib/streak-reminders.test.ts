import { describe, it, expect, vi } from 'vitest'

// `server-only` is a Next runtime guard, not an npm package — it isn't resolvable under
// Vitest. Same stub as `whot-bot-driver.test.ts`.
vi.mock('server-only', () => ({}))
import { selectStreakReminders, OLDEST_RESUMABLE_DAYS, type StreakProfileRow } from '@/lib/streak-reminders'
import { FREEZE_MAX_HELD, streakStatus } from '@/lib/trophies/streak'

/**
 * Who gets a come-back nudge, and who is deliberately left alone.
 *
 * Getting the second half wrong is the expensive mistake: a push about a streak that already
 * ended is a message the player can do nothing with, and the fastest way to teach someone to
 * turn notifications off. That's the same lesson as the per-round trivia spam this branch
 * already removed — reach for a push only when there is something the player can still act on.
 */

const profile = (over: Partial<StreakProfileRow> = {}): StreakProfileRow => ({
  id: 'p1',
  handle: 'Ada',
  current_streak: 12,
  last_active_date: '2026-08-01',
  streak_freezes: 0,
  ...over,
})

const TODAY = '2026-08-02'

describe('selectStreakReminders', () => {
  it('nudges a live streak that lapses tonight', () => {
    const [r] = selectStreakReminders([profile()], TODAY)
    expect(r.standing).toBe('at_risk')
    expect(r.streak).toBe(12)
    expect(r.body).toContain('12-day streak')
  })

  it('says nothing to a player who already played today', () => {
    expect(selectStreakReminders([profile({ last_active_date: TODAY })], TODAY)).toEqual([])
  })

  it('says nothing to a player with no streak', () => {
    expect(selectStreakReminders([profile({ current_streak: 0 })], TODAY)).toEqual([])
    expect(selectStreakReminders([profile({ last_active_date: null })], TODAY)).toEqual([])
  })

  it('says nothing once the streak is already gone', () => {
    // The important one. A nudge here is about something already lost.
    expect(selectStreakReminders([profile({ last_active_date: '2026-07-01' })], TODAY)).toEqual([])
    expect(selectStreakReminders([profile({ streak_freezes: 0, last_active_date: '2026-07-30' })], TODAY)).toEqual([])
  })

  it('still nudges when a freeze is holding the streak up', () => {
    // Freezes are spent lazily, on the next play — nothing spends them at midnight. So a
    // player on a freeze who keeps not playing keeps getting more expensive.
    const [r] = selectStreakReminders([profile({ streak_freezes: 1, last_active_date: '2026-07-31' })], TODAY)
    expect(r.standing).toBe('frozen')
    expect(r.body).toContain('cost another')
  })

  it('mentions the freeze as an option when one is held', () => {
    const [r] = selectStreakReminders([profile({ streak_freezes: FREEZE_MAX_HELD })], TODAY)
    expect(r.standing).toBe('at_risk')
    expect(r.body).toContain('freeze')
  })

  it('never contradicts streakStatus', () => {
    // The reminder set must be exactly the saveable set — if these drift, players get pushed
    // about streaks that are gone, or miss the one push that mattered.
    const rows: StreakProfileRow[] = []
    for (const last of ['2026-07-28', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', null]) {
      for (const streak_freezes of [0, 1, 2]) {
        rows.push(profile({ id: `${last}-${streak_freezes}`, last_active_date: last, streak_freezes }))
      }
    }
    const chosen = new Set(selectStreakReminders(rows, TODAY).map((r) => r.profileId))
    for (const row of rows) {
      const { standing } = streakStatus(row, TODAY)
      const saveable = standing === 'at_risk' || standing === 'frozen'
      expect(chosen.has(row.id), `${row.id} standing=${standing}`).toBe(saveable)
    }
  })

  it('scopes the SQL prefilter wide enough for the best-case freeze holder', () => {
    // The route narrows by date before calling this. If that window were tighter than what
    // freezes can bridge, the most loyal players — the ones holding a full buffer — would be
    // filtered out in SQL and never considered.
    const widest = profile({ streak_freezes: FREEZE_MAX_HELD, last_active_date: '2026-07-31' })
    expect(OLDEST_RESUMABLE_DAYS).toBe(FREEZE_MAX_HELD + 1)
    const oldestConsidered = new Date(Date.parse(`${TODAY}T00:00:00Z`) - OLDEST_RESUMABLE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    expect(widest.last_active_date! >= oldestConsidered).toBe(true)
    expect(selectStreakReminders([widest], TODAY)).toHaveLength(1)
  })

  it('handles a mixed batch without cross-contaminating the copy', () => {
    const out = selectStreakReminders(
      [
        profile({ id: 'a', current_streak: 3 }),
        profile({ id: 'b', current_streak: 40 }),
        profile({ id: 'c', last_active_date: TODAY }),
      ],
      TODAY
    )
    expect(out.map((r) => r.profileId)).toEqual(['a', 'b'])
    expect(out[0].body).toContain('3-day')
    expect(out[1].body).toContain('40-day')
  })
})
