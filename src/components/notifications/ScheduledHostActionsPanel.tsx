'use client'

/**
 * ScheduledHostActionsPanel — web mirror of the mobile ScheduledHostActionsSheet.
 *
 * Renders inline on the scheduled-game overlay when the caller has a host
 * token stored locally for this game code (i.e. they created it on this
 * browser). Three actions:
 *   - Reschedule presets (Now / +5min / +15min / Custom)
 *   - Cancel (with confirm — fires the "cancelled" push to all RSVPers)
 *   - Transfer host to an RSVPer (mints a fresh host_token; server pushes
 *     both the new host and the other RSVPers per plan)
 *
 * Endpoints are the same ones the mobile sheet uses — this is UI-only.
 */

import { useCallback, useEffect, useState } from 'react'
import { readHostToken, rememberHostToken } from '@/lib/host-session'

type Rsvper = { deviceId: string; name: string; confirmed: boolean }

type Props = {
  gameCode: string
  currentScheduledAt: string | null
  onDone?: () => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '20:00' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '20:00' }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function combineIso(date: string, time: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const local = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0)
  return Number.isNaN(local.getTime()) ? null : local.toISOString()
}

function isoIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

export function ScheduledHostActionsPanel({ gameCode, currentScheduledAt, onDone }: Props) {
  const [hostToken, setHostToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rsvpers, setRsvpers] = useState<Rsvper[]>([])
  const [transferOpen, setTransferOpen] = useState(false)
  const initial = splitIso(currentScheduledAt)
  const [customDate, setCustomDate] = useState(initial.date)
  const [customTime, setCustomTime] = useState(initial.time)

  useEffect(() => {
    setHostToken(readHostToken(gameCode))
  }, [gameCode])

  const loadRsvpers = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameCode.toUpperCase()}/rsvpers`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { rsvpers: Rsvper[] }
      setRsvpers(data.rsvpers ?? [])
    } catch {
      // ignore; picker just shows empty
    }
  }, [gameCode])

  const doReschedule = useCallback(
    async (iso: string) => {
      if (!hostToken) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/games/${gameCode.toUpperCase()}/reschedule`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, scheduled_at: iso }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Could not reschedule')
        onDone?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reschedule')
      } finally {
        setBusy(false)
      }
    },
    [gameCode, hostToken, onDone]
  )

  const onCancel = useCallback(async () => {
    if (!hostToken) return
    if (!confirm('Cancel this scheduled game? Everyone who RSVP’d will be notified.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${gameCode.toUpperCase()}/cancel-scheduled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not cancel')
      window.location.href = '/browse'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel')
    } finally {
      setBusy(false)
    }
  }, [gameCode, hostToken])

  const onTransfer = useCallback(
    async (target: Rsvper) => {
      if (!hostToken) return
      if (!confirm(`Hand off hosting to ${target.name}? You’ll stop being the host.`)) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/games/${gameCode.toUpperCase()}/transfer-scheduled-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, newHostDeviceId: target.deviceId, newHostName: target.name }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Could not transfer')
        const data = (await res.json().catch(() => ({}))) as { hostToken?: string }
        // Handing off means this browser is no longer the host — drop the
        // stored token so we don't keep offering host controls we don't own.
        // The new hostToken is returned in the response but belongs to the
        // recipient device; nothing to do with it here.
        if (data.hostToken) {
          // No-op on this device — recipient gets the token via push metadata
          // in a follow-up. Clearing the local one is the right move.
        }
        rememberHostToken(gameCode, '')
        setTransferOpen(false)
        onDone?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not transfer')
      } finally {
        setBusy(false)
      }
    },
    [gameCode, hostToken, onDone]
  )

  if (!hostToken) return null

  return (
    <div className="glass-card !p-4 space-y-4 text-left">
      <div>
        <p className="text-sm font-bold text-body">Host controls</p>
        <p className="mt-0.5 text-xs text-muted">
          Reschedule to move it earlier or later, or cancel entirely. Start is disabled on scheduled games — reschedule
          to Now to open the lobby immediately.
        </p>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wide text-muted">Reschedule</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void doReschedule(new Date().toISOString())}
            className="btn-primary btn-fit text-xs px-3 py-1.5"
          >
            Now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void doReschedule(isoIn(5))}
            className="btn-secondary btn-fit text-xs px-3 py-1.5"
          >
            +5 min
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void doReschedule(isoIn(15))}
            className="btn-secondary btn-fit text-xs px-3 py-1.5"
          >
            +15 min
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="input-field text-sm flex-1"
          />
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            className="input-field text-sm flex-1"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const iso = combineIso(customDate, customTime)
            if (!iso) return setError('Enter a valid date + time.')
            if (new Date(iso).getTime() <= Date.now()) return setError('Pick a time in the future.')
            void doReschedule(iso)
          }}
          className="btn-primary w-full text-sm py-2"
        >
          Save custom time
        </button>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <p className="text-xs font-black uppercase tracking-wide text-muted">Transfer host</p>
        {!transferOpen ? (
          <button
            type="button"
            className="btn-secondary w-full text-sm py-2"
            onClick={() => {
              void loadRsvpers()
              setTransferOpen(true)
            }}
          >
            Hand off to an RSVPer…
          </button>
        ) : rsvpers.length === 0 ? (
          <p className="text-xs text-muted">No RSVPers to hand off to yet.</p>
        ) : (
          <div className="space-y-1">
            {rsvpers.map((r) => (
              <button
                key={r.deviceId}
                type="button"
                disabled={busy}
                onClick={() => void onTransfer(r)}
                className="w-full flex justify-between items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-inset-bg)]"
              >
                <span className="text-body">{r.name}</span>
                <span className="text-xs text-muted">Hand off →</span>
              </button>
            ))}
            <button type="button" className="btn-ghost text-xs" onClick={() => setTransferOpen(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCancel()}
          className="w-full text-sm py-2 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10"
        >
          Cancel this scheduled game
        </button>
      </div>
    </div>
  )
}
