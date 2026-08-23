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
  /** Unspent forgiveness days. See {@link FREEZE_EARN_EVERY}. */
  streak_freezes: number
}

/**
 * Freeze economics, resolved in `docs/trophies-and-streaks.md` §10.2: earn one freeze per
 * seven consecutive days, hold at most two, auto-consume one per missed day. Free on every
 * tier — forgiveness is never gated behind a subscription (§0.5).
 *
 * The point of forgiveness is retention: a player who misses one day because life happened
 * comes back to a streak that survived, instead of a zero that tells them not to bother.
 */
export const FREEZE_EARN_EVERY = 7
export const FREEZE_MAX_HELD = 2

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
  const freezes = clampFreezes(state.streak_freezes)

  // First day ever. No previous day to bridge, so freezes are untouched.
  if (!previous) return startingToday(longest, freezes, today)

  const gap = daysBetween(previous, today)
  // Unparseable stored date — start clean rather than propagate the corruption.
  if (Number.isNaN(gap)) return startingToday(longest, freezes, today)

  // Same day, or a date ahead of today. Nothing to advance, nothing to spend.
  if (gap <= 0) {
    return {
      current_streak: current,
      longest_streak: longest,
      last_active_date: previous,
      streak_freezes: freezes,
    }
  }

  // Days between the last active day and today that nobody played. gap === 1 is consecutive,
  // so nothing was missed.
  const missed = gap - 1

  // Freezes cover a gap ONLY if they cover it whole. Spending one against a three-day gap the
  // player can't bridge burns forgiveness for nothing and still breaks the streak — the worst
  // of both. Under-spending is recoverable; a wasted freeze isn't.
  if (missed > 0 && freezes < missed) return startingToday(longest, freezes, today)

  const spent = missed
  const next = current + 1
  return {
    current_streak: next,
    longest_streak: Math.max(longest, next),
    last_active_date: today,
    streak_freezes: earnFreeze(freezes - spent, next),
  }
}

/** Day one of a new streak. A broken streak keeps whatever freezes were unspent. */
function startingToday(longest: number, freezes: number, today: string): StreakState {
  return {
    current_streak: 1,
    longest_streak: Math.max(longest, 1),
    last_active_date: today,
    streak_freezes: earnFreeze(freezes, 1),
  }
}

/**
 * Grant a freeze on every seventh day of a streak, capped at {@link FREEZE_MAX_HELD}.
 *
 * Keyed off the streak length rather than a running counter so it cannot double-grant: the
 * same day evaluated twice yields the same answer, which is the property `advanceStreak`
 * relies on everywhere else.
 */
function earnFreeze(freezes: number, streakLength: number): number {
  const earned = streakLength > 0 && streakLength % FREEZE_EARN_EVERY === 0 ? 1 : 0
  return clampFreezes(freezes + earned)
}

function clampFreezes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(FREEZE_MAX_HELD, Math.max(0, Math.floor(value)))
}

/**
 * What the streak looks like RIGHT NOW, for display and for the reminder job.
 *
 * `advanceStreak` answers "the player just played"; this answers "the player hasn't". They are
 * different questions and the second one had no home, which is why nothing on either platform
 * could show a streak as about to lapse.
 *
 * The states answer one question: what does keeping this streak cost today, and can they still
 * afford it?
 *
 *   - `none`    — no streak to lose.
 *   - `safe`    — already played today. Costs nothing.
 *   - `at_risk` — a live streak, no play today, and playing today costs no freezes. It ends at
 *                 WAT midnight unless they play.
 *   - `frozen`  — same, but they already missed earlier days, so returning costs freezes they
 *                 do still hold. Saveable today, at a price that rises with every further day.
 *   - `broken`  — the gap already exceeds what their freezes can bridge. Nothing left to save.
 *
 * Note `frozen` is NOT self-healing. Freezes are spent lazily, by `advanceStreak`, when the
 * player next plays — nothing runs at midnight to spend them. A player who never comes back
 * never spends one. So `at_risk` and `frozen` are both worth a reminder; `safe` and `none`
 * have nothing to say, and `broken` is a nudge about something already lost, which reads as a
 * reprimand rather than an invitation.
 */
export type StreakStanding = 'none' | 'safe' | 'at_risk' | 'frozen' | 'broken'

export function streakStatus(
  state: Pick<StreakState, 'current_streak' | 'last_active_date' | 'streak_freezes'>,
  today: string = watDate()
): { standing: StreakStanding; streak: number; freezes: number } {
  const streak = Math.max(0, state.current_streak || 0)
  const freezes = clampFreezes(state.streak_freezes)
  const base = { streak, freezes }

  if (streak <= 0 || !state.last_active_date) return { standing: 'none', ...base }

  const gap = daysBetween(state.last_active_date, today)
  // Junk or a future date: not something to nag a player about. Treat as settled.
  if (Number.isNaN(gap) || gap <= 0) return { standing: 'safe', ...base }

  // Playing today would leave `gap - 1` days unplayed, and each costs one freeze.
  const wouldCost = gap - 1
  if (wouldCost > freezes) return { standing: 'broken', ...base }

  // Today itself is not missed yet — the player still has until WAT midnight. So they are at
  // risk unless a freeze is already committed to covering an EARLIER missed day.
  return { standing: wouldCost > 0 ? 'frozen' : 'at_risk', ...base }
}
