/**
 * Streak READ-side helpers for the mobile app.
 *
 * Deliberately a mirror, not the original. The engine lives in `src/lib/trophies/streak.ts` on
 * the web side, because advancing a streak is a SERVER concern — it runs in the award pass
 * against a server timestamp, and letting a client compute it would let a device clock buy
 * days. What mobile needs is the other half: given a profile the server already wrote, say
 * whether the streak is safe, at risk, or gone.
 *
 * So only the pure read helpers are duplicated here, never `advanceStreak`. Web does not depend
 * on this package (see `src/lib/public-hints.ts`), so the duplication is the price of that
 * boundary; `src/lib/streak-shared-parity.test.ts` runs both copies over the same inputs and
 * fails when they disagree, which is the drift that would actually hurt.
 */

/** WAT is UTC+1 year-round — no DST, which is why a fixed offset is safe here. */
const WAT_OFFSET_MINUTES = 60

/** The WAT calendar date for an instant, as `YYYY-MM-DD` — matches `profiles.last_active_date`. */
export function watDate(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + WAT_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN
  return Math.round((b - a) / 86_400_000)
}

/** Freeze economics — see `docs/trophies-and-streaks.md` §10.2. Kept in step with the web copy. */
export const FREEZE_EARN_EVERY = 7
export const FREEZE_MAX_HELD = 2

function clampFreezes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(FREEZE_MAX_HELD, Math.max(0, Math.floor(value)))
}

/**
 * What the streak looks like right now. See the web copy for the full rationale behind each
 * standing; the short version is that these answer "what does keeping this streak cost today,
 * and can they still afford it?".
 */
export type StreakStanding = 'none' | 'safe' | 'at_risk' | 'frozen' | 'broken'

export type StreakReadState = {
  current_streak: number
  last_active_date: string | null
  streak_freezes: number
}

export function streakStatus(
  state: StreakReadState,
  today: string = watDate()
): { standing: StreakStanding; streak: number; freezes: number } {
  const streak = Math.max(0, state.current_streak || 0)
  const freezes = clampFreezes(state.streak_freezes)
  const base = { streak, freezes }

  if (streak <= 0 || !state.last_active_date) return { standing: 'none', ...base }

  const gap = daysBetween(state.last_active_date, today)
  if (Number.isNaN(gap) || gap <= 0) return { standing: 'safe', ...base }

  const wouldCost = gap - 1
  if (wouldCost > freezes) return { standing: 'broken', ...base }
  return { standing: wouldCost > 0 ? 'frozen' : 'at_risk', ...base }
}

/** Whether the flame should read as burning down rather than lit. */
export function streakIsAtRisk(state: StreakReadState | null | undefined): boolean {
  if (!state) return false
  const { standing } = streakStatus(state)
  return standing === 'at_risk' || standing === 'frozen'
}

/**
 * One line of copy for the current standing, or `null` when there is nothing worth saying —
 * no streak, already played today, or already lost. A nudge about a streak that is already
 * gone reads as a reprimand.
 */
export function streakNote(state: StreakReadState, today: string = watDate()): string | null {
  const { standing, streak, freezes } = streakStatus(state, today)
  if (standing === 'at_risk') {
    if (freezes > 0) {
      const held = freezes === 1 ? 'freeze' : `${freezes} freezes`
      return `Play today to keep your ${streak}-day streak — or one of your ${held} covers it.`
    }
    return `Play today to keep your ${streak}-day streak.`
  }
  if (standing === 'frozen') {
    return `You missed a day — a freeze will cover it. Play today so it doesn't cost another.`
  }
  return null
}
