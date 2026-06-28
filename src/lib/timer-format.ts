/**
 * Shared countdown/timer helpers. These were copy-pasted (byte-identical within each
 * group) across ~17 game timer hooks/components; hoisted here as the single source.
 */

/** Whole seconds remaining until `at` (an ISO timestamp), clamped at 0. */
export function secondsUntil(at: string | null | undefined): number {
  if (!at) return 0
  const deadlineMs = new Date(at).getTime()
  if (!Number.isFinite(deadlineMs)) return 0 // malformed timestamp → treat as expired (not NaN)
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

/** Format a duration as `h:mm:ss`, dropping the hours segment when under an hour. */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Format a duration as `m:ss` (minutes may exceed 59; never shows an hours segment). */
export function formatMinutesSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
