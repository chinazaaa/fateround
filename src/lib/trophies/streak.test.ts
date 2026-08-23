import { describe, it, expect } from 'vitest'
import {
  FREEZE_EARN_EVERY,
  FREEZE_MAX_HELD,
  advanceStreak,
  daysBetween,
  streakStatus,
  watDate,
  type StreakState,
} from './streak'

const state = (over: Partial<StreakState> = {}): StreakState => ({
  current_streak: 3,
  longest_streak: 5,
  last_active_date: '2026-08-01',
  streak_freezes: 0,
  ...over,
})

describe('watDate', () => {
  it('uses the WAT calendar, not UTC', () => {
    // 23:30 UTC is already the next day in Lagos. Getting this wrong shifts every streak
    // boundary by an hour and breaks "played today" for late-night players — which is exactly
    // when a party game gets used.
    expect(watDate(new Date('2026-08-01T23:30:00Z'))).toBe('2026-08-02')
    expect(watDate(new Date('2026-08-01T22:30:00Z'))).toBe('2026-08-01')
  })

  it('returns a plain YYYY-MM-DD, matching profiles.last_active_date', () => {
    expect(watDate(new Date('2026-08-01T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('daysBetween', () => {
  it('counts whole days across a month boundary', () => {
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1)
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
    expect(daysBetween('2026-08-01', '2026-07-31')).toBe(-1)
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
  })

  it('is NaN for junk rather than guessing', () => {
    expect(Number.isNaN(daysBetween('not-a-date', '2026-08-01'))).toBe(true)
  })
})

describe('advanceStreak', () => {
  it('starts a streak for a player with no history', () => {
    expect(
      advanceStreak(state({ current_streak: 0, longest_streak: 0, last_active_date: null }), '2026-08-02')
    ).toEqual({ current_streak: 1, longest_streak: 1, last_active_date: '2026-08-02', streak_freezes: 0 })
  })

  it('extends on a consecutive day', () => {
    expect(advanceStreak(state(), '2026-08-02')).toEqual({
      current_streak: 4,
      longest_streak: 5,
      last_active_date: '2026-08-02',
      streak_freezes: 0,
    })
  })

  it('raises the longest when the current passes it', () => {
    expect(advanceStreak(state({ current_streak: 5, longest_streak: 5 }), '2026-08-02')).toEqual({
      current_streak: 6,
      longest_streak: 6,
      last_active_date: '2026-08-02',
      streak_freezes: 0,
    })
  })

  it('does nothing when today is already counted', () => {
    // A player finishes several games a day. Without this the streak would count games, not
    // days — so the idempotence lives here rather than in each caller.
    const before = state()
    expect(advanceStreak(before, '2026-08-01')).toEqual(before)
  })

  it('resets to day one after a gap', () => {
    expect(advanceStreak(state(), '2026-08-05')).toEqual({
      current_streak: 1,
      longest_streak: 5, // the record survives the reset
      last_active_date: '2026-08-05',
      streak_freezes: 0,
    })
  })

  it('treats a two-day gap as broken, not extended', () => {
    // The classic off-by-one: "yesterday" is a gap of exactly 1, never 2.
    expect(advanceStreak(state(), '2026-08-03').current_streak).toBe(1)
  })

  it('does not punish a player for a future stored date', () => {
    // Clock skew or a bad backfill. Resetting their streak because OUR data is wrong is the
    // worse failure, so a date ahead of today counts as already-recorded.
    const before = state({ last_active_date: '2026-09-01' })
    expect(advanceStreak(before, '2026-08-02')).toEqual(before)
  })

  it('starts clean on an unparseable stored date rather than propagating it', () => {
    expect(advanceStreak(state({ last_active_date: 'garbage' }), '2026-08-02')).toEqual({
      current_streak: 1,
      longest_streak: 5,
      last_active_date: '2026-08-02',
      streak_freezes: 0,
    })
  })

  it('treats negative stored counters as zero', () => {
    expect(advanceStreak(state({ current_streak: -4, longest_streak: -1 }), '2026-08-02')).toEqual({
      current_streak: 1,
      longest_streak: 1,
      last_active_date: '2026-08-02',
      streak_freezes: 0,
    })
  })
})

/**
 * Freezes are the forgiveness mechanic (`docs/trophies-and-streaks.md` §4.4, §10.2): earn one
 * per seven consecutive days, hold at most two, auto-consume one per missed day.
 *
 * The column existed from the first migration and was selected into every profile payload and
 * typed on both platforms — but nothing ever wrote it and `advanceStreak` never read it. A
 * player could hold two freezes and still lose a 40-day streak to one missed evening.
 */
describe('advanceStreak — freezes', () => {
  it('spends one freeze to bridge a single missed day', () => {
    // Sunday played, Monday missed, Tuesday played. The streak should survive at 4, not reset.
    expect(advanceStreak(state({ current_streak: 3, streak_freezes: 1 }), '2026-08-03')).toEqual({
      current_streak: 4,
      longest_streak: 5,
      last_active_date: '2026-08-03',
      streak_freezes: 0,
    })
  })

  it('spends two freezes to bridge two missed days', () => {
    expect(advanceStreak(state({ current_streak: 3, streak_freezes: 2 }), '2026-08-04')).toEqual({
      current_streak: 4,
      longest_streak: 5,
      last_active_date: '2026-08-04',
      streak_freezes: 0,
    })
  })

  it('spends nothing on a consecutive day — freezes are for gaps only', () => {
    expect(advanceStreak(state({ streak_freezes: 2 }), '2026-08-02').streak_freezes).toBe(2)
  })

  it('spends nothing when the player already played today', () => {
    expect(advanceStreak(state({ streak_freezes: 2 }), '2026-08-01').streak_freezes).toBe(2)
  })

  it('keeps the freezes when the gap is too wide to bridge', () => {
    // Three missed days against two freezes. Spending both would burn the forgiveness AND
    // still break the streak — the worst of both outcomes. Under-spending is recoverable.
    expect(advanceStreak(state({ current_streak: 3, streak_freezes: 2 }), '2026-08-05')).toEqual({
      current_streak: 1,
      longest_streak: 5,
      last_active_date: '2026-08-05',
      streak_freezes: 2,
    })
  })

  it('breaks when the player holds none', () => {
    expect(advanceStreak(state({ streak_freezes: 0 }), '2026-08-03').current_streak).toBe(1)
  })

  it(`earns one freeze on day ${FREEZE_EARN_EVERY}`, () => {
    const day7 = advanceStreak(state({ current_streak: 6, streak_freezes: 0 }), '2026-08-02')
    expect(day7.current_streak).toBe(FREEZE_EARN_EVERY)
    expect(day7.streak_freezes).toBe(1)
  })

  it('earns nothing on the days in between', () => {
    for (const from of [1, 2, 3, 4, 5, 7, 8]) {
      const next = advanceStreak(state({ current_streak: from, streak_freezes: 0 }), '2026-08-02')
      const expected = next.current_streak % FREEZE_EARN_EVERY === 0 ? 1 : 0
      expect(next.streak_freezes, `day ${next.current_streak}`).toBe(expected)
    }
  })

  it(`holds at most ${FREEZE_MAX_HELD}`, () => {
    // Day 21 with two already banked. The cap is what stops a long streak from becoming
    // unloseable.
    const capped = advanceStreak(state({ current_streak: 20, streak_freezes: FREEZE_MAX_HELD }), '2026-08-02')
    expect(capped.current_streak).toBe(21)
    expect(capped.streak_freezes).toBe(FREEZE_MAX_HELD)
  })

  it('clamps a stored value above the cap rather than trusting it', () => {
    expect(advanceStreak(state({ streak_freezes: 99 }), '2026-08-02').streak_freezes).toBe(FREEZE_MAX_HELD)
  })

  it('treats a negative or missing stored value as zero', () => {
    expect(advanceStreak(state({ streak_freezes: -3 }), '2026-08-03').current_streak).toBe(1)
    expect(advanceStreak(state({ streak_freezes: NaN }), '2026-08-02').streak_freezes).toBe(0)
  })

  it('can earn and spend on the same day', () => {
    // Day 6 → missed a day → comes back on what becomes day 7. The freeze pays for the gap,
    // and reaching seven earns the next one.
    const next = advanceStreak(state({ current_streak: 6, streak_freezes: 1 }), '2026-08-03')
    expect(next.current_streak).toBe(7)
    expect(next.streak_freezes).toBe(1)
  })

  it('survives a realistic month: two lapses, both covered', () => {
    // Walk a calendar rather than assert one transition — the interaction between earning
    // every seventh day and spending on a gap is where an off-by-one would hide.
    let s: StreakState = { current_streak: 0, longest_streak: 0, last_active_date: null, streak_freezes: 0 }
    const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
    const skipped = new Set([10, 20])
    for (let d = 1; d <= 28; d++) {
      if (skipped.has(d)) continue
      s = advanceStreak(s, day(d))
    }
    // 28 days, 2 skipped, both bridged by a freeze → an unbroken 26-day streak.
    expect(s.current_streak).toBe(26)
    expect(s.longest_streak).toBe(26)
    expect(s.last_active_date).toBe('2026-09-28')
  })

  it('is idempotent across a same-day replay, freezes included', () => {
    // The award pass runs per finished game. Replaying it must not spend or earn twice.
    const once = advanceStreak(state({ current_streak: 6, streak_freezes: 1 }), '2026-08-03')
    expect(advanceStreak(once, '2026-08-03')).toEqual(once)
  })
})

/**
 * `streakStatus` answers the question `advanceStreak` cannot: the player has NOT played. It
 * drives the at-risk banner on both platforms and picks who the reminder job pings.
 */
describe('streakStatus', () => {
  const at = (over: Partial<StreakState> = {}) => streakStatus(state(over), '2026-08-02')

  it('reports nothing to lose when there is no streak', () => {
    expect(at({ current_streak: 0 }).standing).toBe('none')
    expect(at({ last_active_date: null }).standing).toBe('none')
  })

  it('is safe once the player has played today', () => {
    expect(at({ last_active_date: '2026-08-02' }).standing).toBe('safe')
  })

  it('is at risk the day after the last play', () => {
    // Played yesterday, not today: the streak dies at WAT midnight tonight.
    expect(at().standing).toBe('at_risk')
  })

  it('is at risk even holding freezes — today is not missed yet', () => {
    // A freeze pays for a day already gone, not for today. Someone with a full buffer still
    // has to play today to avoid spending one.
    expect(at({ streak_freezes: FREEZE_MAX_HELD }).standing).toBe('at_risk')
  })

  it('is frozen when an earlier day is already outstanding but affordable', () => {
    expect(streakStatus(state({ streak_freezes: 1 }), '2026-08-03').standing).toBe('frozen')
  })

  it('is broken once the gap outruns the freezes', () => {
    expect(streakStatus(state({ streak_freezes: 0 }), '2026-08-03').standing).toBe('broken')
    expect(streakStatus(state({ streak_freezes: FREEZE_MAX_HELD }), '2026-08-06').standing).toBe('broken')
  })

  it('does not nag on junk or future dates', () => {
    expect(streakStatus(state({ last_active_date: 'garbage' }), '2026-08-02').standing).toBe('safe')
    expect(streakStatus(state({ last_active_date: '2026-09-01' }), '2026-08-02').standing).toBe('safe')
  })

  it('agrees with advanceStreak about what survives', () => {
    // The two functions must not disagree: anything streakStatus calls saveable, advanceStreak
    // must actually save. This is the invariant a divergence would break silently.
    for (const freezes of [0, 1, 2]) {
      for (let gapDays = 1; gapDays <= 5; gapDays++) {
        const today = `2026-08-${String(1 + gapDays).padStart(2, '0')}`
        const before = state({ current_streak: 4, streak_freezes: freezes })
        const status = streakStatus(before, today)
        const after = advanceStreak(before, today)
        const survived = after.current_streak > 1
        expect(survived, `freezes=${freezes} gap=${gapDays} standing=${status.standing}`).toBe(
          status.standing === 'at_risk' || status.standing === 'frozen'
        )
      }
    }
  })
})
