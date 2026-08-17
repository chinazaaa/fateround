'use client'

/**
 * TournamentScheduledHostActionsPanel — host controls for a scheduled tournament.
 *
 * Mirror of the game-side ScheduledHostActionsPanel. Renders next to the
 * ScheduledEventCard when the tournament is scheduled and the viewer is the
 * host. Three actions per plan (bottom of docs/mobile-discovery-plan.md):
 *   1. Reschedule — presets (Now / +5min / +15min / Custom)
 *   2. Cancel     — destructive; confirm dialog + "cancelled" push
 *   3. Transfer   — pick a registered player; mints new host_token
 *
 * "Now" reschedule just sets scheduled_at to the current instant; the T-0
 * cron then opens the tournament on its normal path.
 */

import { useCallback, useEffect, useState } from 'react'

type Player = { id: string; name: string; is_eliminated?: boolean | null }

type Props = {
  tournamentId: string
  hostToken: string
  currentScheduledAt: string | null
  players: Player[]
  /** Optional current host display name; used in transfer push copy. */
  hostName?: string | null
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

export function TournamentScheduledHostActionsPanel({
  tournamentId,
  hostToken,
  currentScheduledAt,
  players,
  hostName,
  onDone,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const initial = splitIso(currentScheduledAt)
  const [customDate, setCustomDate] = useState(initial.date)
  const [customTime, setCustomTime] = useState(initial.time)

  // Re-seed the custom pickers whenever the source scheduled_at shifts (e.g.
  // after a reschedule from another device).
  useEffect(() => {
    const next = splitIso(currentScheduledAt)
    setCustomDate(next.date)
    setCustomTime(next.time)
  }, [currentScheduledAt])

  const doReschedule = useCallback(
    async (iso: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/reschedule`, {
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
    [tournamentId, hostToken, onDone]
  )

  const onCancel = useCallback(async () => {
    if (!confirm('Cancel this tournament? Every registered player will be notified.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/cancel-scheduled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not cancel')
      window.location.href = '/'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel')
    } finally {
      setBusy(false)
    }
  }, [tournamentId, hostToken])

  const onTransfer = useCallback(
    async (target: Player) => {
      if (!confirm(`Hand off hosting to ${target.name}? You’ll stop being the host of this tournament.`)) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/transfer-scheduled-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostToken,
            newHostPlayerId: target.id,
            oldHostName: hostName ?? undefined,
            newHostName: target.name,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Could not transfer')
        // Recipient gets the new host_token via the push metadata (or by
        // re-opening the tournament from a device that already stores it).
        // This browser no longer owns the tournament — reload to shed the
        // host chrome.
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not transfer')
      } finally {
        setBusy(false)
      }
    },
    [tournamentId, hostToken, hostName]
  )

  const eligible = players.filter((p) => !p.is_eliminated)

  return (
    <div className="glass-card !p-4 space-y-4">
      <div>
        <p className="text-sm font-bold text-body">Host controls</p>
        <p className="mt-0.5 text-xs text-muted">
          Reschedule to move it earlier or later, cancel it, or hand hosting off to a registered player. Cancel +
          reschedule + transfer all notify every registered player.
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
          <button type="button" className="btn-secondary w-full text-sm py-2" onClick={() => setTransferOpen(true)}>
            Pick a player to hand off to…
          </button>
        ) : eligible.length === 0 ? (
          <p className="text-xs text-muted">No registered players to hand off to yet.</p>
        ) : (
          <div className="space-y-1">
            {eligible.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => void onTransfer(p)}
                className="w-full flex justify-between items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-inset-bg)]"
              >
                <span className="text-body">{p.name}</span>
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
          Cancel this tournament
        </button>
      </div>
    </div>
  )
}
