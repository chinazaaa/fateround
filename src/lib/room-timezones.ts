const POPULAR_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Helsinki',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const

export function isValidRoomTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function formatRoomTimezone(value: string): string {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: value,
      timeZoneName: 'shortOffset',
    }).formatToParts(now)
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
    const city = value.split('/').pop()?.replace(/_/g, ' ') ?? value
    return offset ? `${city} (${offset})` : city
  } catch {
    return value
  }
}

export function getUserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

export function getRoomTimezoneOptions(): { value: string; label: string }[] {
  const values = new Set<string>(POPULAR_TIMEZONES)
  const userTz = getUserTimezone()
  if (userTz) values.add(userTz)

  return Array.from(values)
    .filter(isValidRoomTimezone)
    .map((value) => ({ value, label: formatRoomTimezone(value) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function normalizeRoomTimezone(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (!isValidRoomTimezone(value)) return null
  return value
}

export const ROOM_DESCRIPTION_MAX = 300

export function normalizeRoomDescription(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  return value.slice(0, ROOM_DESCRIPTION_MAX)
}
