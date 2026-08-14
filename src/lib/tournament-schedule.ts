import type { Tournament } from '@/types/tournament'

/** Milliseconds → human "in 3 days 4h" / "in 2h 15m" / "in 5m" / "starting now" / "started 3h ago". */
export function formatCountdown(deltaMs: number): string {
  const abs = Math.abs(deltaMs)
  const seconds = Math.round(abs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const past = deltaMs < 0

  if (abs < 45_000) return past ? 'starting now' : 'starting now'

  let phrase: string
  if (days > 0) {
    const remH = hours - days * 24
    phrase = remH > 0 ? `${days}d ${remH}h` : `${days}d`
  } else if (hours > 0) {
    const remM = minutes - hours * 60
    phrase = remM > 0 ? `${hours}h ${remM}m` : `${hours}h`
  } else if (minutes > 0) {
    phrase = `${minutes}m`
  } else {
    phrase = `${seconds}s`
  }
  return past ? `started ${phrase} ago` : `in ${phrase}`
}

/** Full-date, timezone-aware label: "Fri, 20 Aug · 8:00 PM". */
export function formatScheduledFor(iso: string): string {
  const date = new Date(iso)
  const dayPart = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${dayPart} · ${timePart}`
}

/** Fold a text line for iCalendar's 75-octet limit (RFC 5545 §3.1). */
function foldIcsLine(line: string): string {
  const limit = 74
  if (line.length <= limit) return line
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? limit : limit - 1))
    out.push(i === 0 ? chunk : ` ${chunk}`)
    i += chunk.length - (i === 0 ? 0 : 1)
  }
  return out.join('\r\n')
}

/** iCal-escape: backslashes, commas, semicolons, and CR/LF. */
function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\n|\r/g, '\\n')
}

/** UTC timestamp in iCal's basic format (YYYYMMDDTHHMMSSZ), no punctuation. */
function toIcsStamp(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/** iCalendar TRIGGER duration for a reminder N minutes before the event. */
function alarmTriggerBefore(minutes: number): string {
  if (minutes <= 0) return '-PT0M'
  if (minutes >= 60 && minutes % 60 === 0) return `-PT${minutes / 60}H`
  return `-PT${minutes}M`
}

/** Default alarm ladder — 1 hour, 10 minutes, and at-start. These are baked
 *  into every .ics so the viewer's calendar app pings them without any push
 *  infrastructure of ours. Users can delete alarms they don't want in their
 *  calendar client. */
export const DEFAULT_ALARM_MINUTES_BEFORE = [60, 10, 0] as const

/**
 * Build an .ics (iCalendar) file for a scheduled tournament — so the host and
 * every pre-registering player can drop it into Google/Apple/Outlook calendars.
 * Includes the invite URL in DESCRIPTION and URL so the calendar reminder ships
 * with a working "join" link. Duration defaults to `durationSeconds` (typically
 * the playlist estimate); 60 minutes when the caller has no better guess.
 *
 * Also embeds native VALARM reminders (1h before, 10min before, at start by
 * default) so the viewer's calendar app pings them at those milestones — no
 * web-push infrastructure required, works on iOS without PWA install.
 *
 * `stampIso` is the "now" reference (DTSTAMP + created_at proxy). Passed in
 * rather than read from `new Date()` so the file is deterministic for tests
 * and identical across two downloads a second apart.
 */
export function buildTournamentIcs(
  tournament: Tournament,
  inviteUrl: string,
  durationSeconds: number,
  stampIso: string,
  alarmMinutesBefore: readonly number[] = DEFAULT_ALARM_MINUTES_BEFORE
): string {
  if (!tournament.scheduled_at) throw new Error('Tournament is not scheduled')
  const start = new Date(tournament.scheduled_at)
  const end = new Date(start.getTime() + Math.max(60, durationSeconds) * 1000)
  const stamp = new Date(stampIso)

  const alarmBlocks = alarmMinutesBefore.flatMap((mins) => {
    const label =
      mins <= 0
        ? `${tournament.title} — starting now`
        : `${tournament.title} — starts in ${mins < 60 ? `${mins} min` : `${mins / 60} hour${mins === 60 ? '' : 's'}`}`
    return [
      'BEGIN:VALARM',
      `TRIGGER:${alarmTriggerBefore(mins)}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(label)}`,
      'END:VALARM',
    ]
  })

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fateround//tournament//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:tournament-${tournament.id}@fateround.com`,
    `DTSTAMP:${toIcsStamp(stamp)}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SUMMARY:${escapeIcsText(tournament.title)}`,
    `DESCRIPTION:${escapeIcsText(`Join at ${inviteUrl}\n\nCode: ${tournament.id}`)}`,
    `URL:${escapeIcsText(inviteUrl)}`,
    ...alarmBlocks,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine)

  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

/** Wraps an .ics string in a text/calendar Blob suitable for a download link. */
export function icsBlob(ics: string): Blob {
  return new Blob([ics], { type: 'text/calendar;charset=utf-8' })
}
