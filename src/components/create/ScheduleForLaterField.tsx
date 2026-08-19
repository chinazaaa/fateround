'use client'

/**
 * ScheduleForLaterField — web "Schedule for later" toggle + inputs.
 *
 * Renders under the Visibility toggle on the create page. Works for both
 * Public (Browse Upcoming discovery) and Private (invite-by-link) games —
 * server accepts either. Uses `<input type="date">` + `<input type="time">`
 * so the browser's native picker handles the actual selection, with a
 * `min` on both to block picking a past instant.
 */

import { useCallback, useMemo } from 'react'

type Props = {
  /** Kept for callers that still pass it — no longer gates rendering. Used only
   *  to swap the sub-copy under the toggle. */
  isPublic: boolean
  scheduledAt: string | null
  onChange: (nextIso: string | null) => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date, time }
}

function combineIso(date: string, time: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const local = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0)
  if (Number.isNaN(local.getTime())) return null
  return local.toISOString()
}

export function ScheduleForLaterField({ isPublic, scheduledAt, onChange }: Props) {
  const enabled = scheduledAt != null
  const { date, time } = useMemo(() => splitIso(scheduledAt), [scheduledAt])
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }, [])

  // Min bounds for the date + time pickers. Date input can go as early as
  // today (any time later today is still valid); the time input's own min
  // only applies when the picked date IS today — pick tomorrow and any time
  // is fine.
  const todayStr = useMemo(() => todayIso(), [])
  const nowTimeStr = useMemo(() => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }, [])
  const isToday = date === todayStr

  const inFuture = (iso: string): boolean => new Date(iso).getTime() > Date.now()

  const toggle = useCallback(
    (next: boolean) => {
      if (!next) return onChange(null)
      const t = new Date()
      t.setHours(20, 0, 0, 0)
      t.setDate(t.getDate() + 1)
      onChange(t.toISOString())
    },
    [onChange]
  )

  const setDate = useCallback(
    (value: string) => {
      // If the user picks today with a time that's already past, bump the
      // time to "5 minutes from now" so we never store a past ISO.
      let nextTime = time || '20:00'
      if (value === todayStr) {
        const combined = combineIso(value, nextTime)
        if (!combined || !inFuture(combined)) {
          const bump = new Date(Date.now() + 5 * 60 * 1000)
          nextTime = `${pad(bump.getHours())}:${pad(bump.getMinutes())}`
        }
      }
      const next = combineIso(value, nextTime)
      if (next && inFuture(next)) onChange(next)
    },
    [time, onChange, todayStr]
  )

  const setTime = useCallback(
    (value: string) => {
      const useDate = date || todayStr
      const next = combineIso(useDate, value)
      // Reject a time that would put the ISO in the past (today + <now>);
      // the input's `min` attribute already blocks it in modern browsers,
      // but a keyboard-typed value can still slip through.
      if (next && inFuture(next)) onChange(next)
    },
    [date, onChange, todayStr]
  )

  return (
    <div className="mt-3 space-y-2">
      <label className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-body">Schedule for later</span>
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4" />
      </label>
      {enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">Date</span>
              <input
                type="date"
                value={date}
                min={todayStr}
                onChange={(e) => setDate(e.target.value)}
                className="input-field w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">Time</span>
              <input
                type="time"
                value={time}
                min={isToday ? nowTimeStr : undefined}
                onChange={(e) => setTime(e.target.value)}
                className="input-field w-full"
              />
            </label>
          </div>
          <p className="text-xs text-faint">
            {tz ? `Times are in your local zone (${tz}).` : 'Times use this browser’s local zone.'}
          </p>
          <p className="text-xs text-faint">
            {isPublic
              ? 'Anyone browsing can RSVP. We’ll ping RSVPers 15 min before it opens.'
              : 'Only people you share the link with can RSVP. We’ll ping them 15 min before it opens.'}
          </p>
        </>
      ) : (
        <p className="text-xs text-faint">Off — the game opens right after you tap Create.</p>
      )}
    </div>
  )
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
