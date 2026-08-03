/**
 * Streak arithmetic (`docs/trophies-and-streaks.md` §4). Pure, so it can be tested at the
 * boundaries that actually break: midnight, the day after, and the gap.
 *
 * WHY A FIXED TIMEZONE. A streak has to be computed against ONE calendar, not the player's
 * device clock. Using the device would let someone keep a streak alive by changing their
 * timezone, and would break a real player who flies somewhere — the same 24 hours would count
 * as two days or none. FateRound is a Nigeria-first product, so the calendar is WAT (UTC+1,
 * no daylight saving), and it is applied server-side to a server timestamp.
 */

/** WAT is UTC+1 year-round — no DST, which is why a fixed offset is safe here. */
const WAT_OFFSET_MINUTES = 60

/**
 * The WAT calendar date for an instant, as `YYYY-MM-DD` — the exact shape of
 * `profiles.last_active_date`.
 */
export function watDate(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + WAT_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/** Hour of day (0–23) on the WAT clock. Used for time-of-day counters like late-night play. */
export function watHour(at: Date = new Date()): number {
  return new Date(at.getTime() + WAT_OFFSET_MINUTES * 60_000).getUTCHours()
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN
  return Math.round((b - a) / 86_400_000)
}

export type StreakState = {
  current_streak: number
  longest_streak: number
  last_active_date: string | null
}

/**
 * Advance a streak because the player finished a game today.
 *
 * Returns the state unchanged when today is already counted, so calling this twice in one day
 * — which will happen, because a player finishes several games — cannot inflate the streak.
 * That idempotence lives here rather than in the caller so every path gets it.
 *
 * A `last_active_date` in the FUTURE (clock skew, a bad backfill) is treated as "already
 * counted" rather than resetting the streak to 1: punishing a player for our own bad data is
 * the worse failure.
 */
export function advanceStreak(state: StreakState, today: string = watDate()): StreakState {
  const previous = state.last_active_date
  const current = Math.max(0, state.current_streak || 0)
  const longest = Math.max(0, state.longest_streak || 0)

  if (!previous) {
    return { current_streak: 1, longest_streak: Math.max(longest, 1), last_active_date: today }
  }

  const gap = daysBetween(previous, today)
  if (Number.isNaN(gap)) {
    // Unparseable stored date — start clean rather than propagate the corruption.
    return { current_streak: 1, longest_streak: Math.max(longest, 1), last_active_date: today }
  }
  // Same day, or a date ahead of today. Nothing to advance.
  if (gap <= 0) return { current_streak: current, longest_streak: longest, last_active_date: previous }

  // Consecutive day → extend. Any longer gap → the streak broke, so this is day one again.
  const next = gap === 1 ? current + 1 : 1
  return { current_streak: next, longest_streak: Math.max(longest, next), last_active_date: today }
}
