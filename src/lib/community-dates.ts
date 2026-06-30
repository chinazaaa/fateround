// Calendar-window helpers for the community leaderboard.
//
// All boundaries are in West Africa Time (Africa/Lagos, fixed UTC+1, no DST), so
// "today's winner" and the Monday week reset line up with the community's night
// rather than UTC. To change the community's timezone, change WAT_TIMEZONE.

export const WAT_TIMEZONE = 'Africa/Lagos'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateStr(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  // Reject impossible dates that Date silently normalizes (e.g. 2026-02-31 -> Mar 3)
  // by round-tripping back to a string and requiring an exact match.
  return d.toISOString().slice(0, 10) === value
}

// Current calendar date in WAT, as YYYY-MM-DD.
export function watToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Treat a YYYY-MM-DD string as a UTC-midnight instant for safe day arithmetic.
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

// Step by whole calendar months, landing on the 1st of the target month.
// (The month window only cares about which month the date falls in.)
export function addMonths(dateStr: string, months: number): string {
  const d = toUtcDate(dateStr)
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)))
}

// Monday → Sunday week containing the given date (inclusive bounds).
export function weekBounds(dateStr: string): { start: string; end: string } {
  const d = toUtcDate(dateStr)
  const day = d.getUTCDay() // 0 = Sunday … 6 = Saturday
  const offsetToMonday = (day + 6) % 7
  const start = addDays(dateStr, -offsetToMonday)
  const end = addDays(start, 6)
  return { start, end }
}

// UTC instant bounds [gte, lt) for querying a timestamptz column (e.g. created_at)
// by an inclusive WAT date range. Africa/Lagos is a fixed +01:00 offset (no DST).
export function watRangeToUtc(startDateStr: string, endDateStr: string): { gte: string; lt: string } {
  return {
    gte: new Date(`${startDateStr}T00:00:00+01:00`).toISOString(),
    lt: new Date(`${addDays(endDateStr, 1)}T00:00:00+01:00`).toISOString(),
  }
}

// First → last day of the calendar month containing the given date.
export function monthBounds(dateStr: string): { start: string; end: string } {
  const d = toUtcDate(dateStr)
  const start = fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
  const end = fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
  return { start, end }
}

// "Tuesday, 30 June"
export function formatDayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toUtcDate(dateStr))
}

// "June 2026"
export function formatMonthLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(toUtcDate(dateStr))
}

// "23–29 June" (same month) or "28 June – 4 July" (cross-month).
export function formatRangeLabel(startStr: string, endStr: string): string {
  const start = toUtcDate(startStr)
  const end = toUtcDate(endStr)
  const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' }).format(d)
  const dayMonth = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(d)

  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${day(start)}–${dayMonth(end)}`
  }
  return `${dayMonth(start)} – ${dayMonth(end)}`
}
