/**
 * Calendar-window helpers for the community leaderboard (mobile).
 *
 * Duplicates the pure section of `src/lib/community-dates.ts` so the mobile
 * leaderboard screen can drive its Today / Week / Month tabs without pulling
 * in the web bundle. The WAT-fixed timezone matches the server so the same
 * "today" boundary lines up across platforms.
 *
 * Hermes on Expo SDK 57 ships full ICU, so Intl.DateTimeFormat with a named
 * timezone works on both iOS and Android.
 */

export const WAT_TIMEZONE = 'Africa/Lagos'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateStr(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === value
}

/** Current calendar date in WAT, as YYYY-MM-DD. */
export function watToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number): string {
  const d = toUtcDate(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

/** Step by whole calendar months, landing on the 1st of the target month. */
export function addMonths(dateStr: string, months: number): string {
  const d = toUtcDate(dateStr)
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)))
}

/**
 * "Tuesday, 30 June" — mirror of `formatDayLabel` in `src/lib/community-dates.ts`.
 *
 * The daily-challenge screens imported this before it existed here, which broke the mobile
 * typecheck (not a CI gate at the time, so it went unnoticed) and would have thrown at
 * runtime on the "Daily Challenge starts …" and per-day leaderboard labels.
 */
export function formatDayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toUtcDate(dateStr))
}
