'use client'

/**
 * ScheduleForLaterField — web "Schedule for later" toggle + inputs.
 *
 * Renders under the Public toggle on the create page when isPublic=true (a
 * private scheduled game has no RSVP audience — the server rejects that pair).
 * Uses `<input type="date">` + `<input type="time">` so the browser's native
 * picker handles the actual selection.
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
  const enabled = isPublic && scheduledAt != null
  const { date, time } = useMemo(() => splitIso(scheduledAt), [scheduledAt])
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }, [])

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
      const next = combineIso(value, time || '20:00')
      if (next) onChange(next)
    },
    [time, onChange]
  )

  const setTime = useCallback(
    (value: string) => {
      const next = combineIso(date || todayIso(), value)
      if (next) onChange(next)
    },
    [date, onChange]
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
                onChange={(e) => setDate(e.target.value)}
                className="input-field w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">Time</span>
              <input
                type="time"
                value={time}
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
