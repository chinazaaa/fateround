'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Tournament } from '@/types/tournament'
import { buildTournamentIcs, formatCountdown, formatScheduledFor, icsBlob } from '@/lib/tournament-schedule'
import { estimatePlaylistSeconds, TIMING_PLAYER_FALLBACK } from '@/lib/tournament-timing'
import { downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { shareOrigin, tournamentInviteUrl } from '@/lib/site'
import { useToast } from '@/components/ui/Toast'

/**
 * Shown at the top of the tournament lobby when the host set a scheduled_at.
 * Renders a large "Starts <day time>" + live countdown, plus an "Add to
 * calendar" (.ics) download for both the host and every pre-registering
 * player — so the event lands in Google/Apple/Outlook and pings them via
 * their existing calendar reminders (we don't need our own notification
 * infra for MVP).
 *
 * The card auto-hides once the tournament transitions past the waiting phase
 * (host started a game). At that point the schedule is history and the
 * lobby's live cards take over.
 */
export function ScheduledEventCard({ tournament, playerCount }: { tournament: Tournament; playerCount: number }) {
  const { success, error } = useToast()
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Re-tick every second so the countdown stays live. Cheap — one setInterval,
  // one setState of a number; the render is a formatted string.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleDownloadIcs = useCallback(() => {
    if (!tournament.scheduled_at) return
    try {
      const inviteUrl = tournamentInviteUrl(tournament.id, shareOrigin())
      // Use the playlist total time when planned; otherwise the calendar block
      // is a placeholder 60 min — hosts can always drag the end time in their
      // calendar app afterwards.
      const duration = tournament.game_queue
        ? estimatePlaylistSeconds(tournament.game_queue, playerCount || TIMING_PLAYER_FALLBACK)
        : 3600
      const ics = buildTournamentIcs(tournament, inviteUrl, duration, new Date(nowMs).toISOString())
      downloadBlobAsFile(icsBlob(ics), `${shareFilenameStem(tournament.title)}.ics`)
      success('Calendar file downloaded — add it to Google, Apple or Outlook')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not create calendar file')
    }
  }, [tournament, playerCount, nowMs, success, error])

  if (!tournament.scheduled_at) return null

  const startsAt = new Date(tournament.scheduled_at).getTime()
  const deltaMs = startsAt - nowMs
  const countdown = formatCountdown(deltaMs)
  const scheduledLabel = formatScheduledFor(tournament.scheduled_at)
  // Once we're within a couple of minutes of start OR past it, drop the "in
  // XX" style for something more urgent so the host doesn't sit staring at
  // "in 30s" without acting.
  const urgent = deltaMs <= 120_000
  const startedAlready = deltaMs < 0

  return (
    <div
      className="glass-card p-5 space-y-3 text-center"
      style={urgent ? { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 1px var(--primary)' } : undefined}
    >
      <p className="label-caps">{startedAlready ? 'Scheduled start' : 'Starts'}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>
        {scheduledLabel}
      </p>
      <p className="text-body text-sm">
        <span className="font-semibold">{countdown}</span>
        {!startedAlready && <span className="text-faint"> · host taps Start on the day</span>}
      </p>
      {playerCount > 0 && !startedAlready && (
        <p className="text-faint text-xs">{playerCount} pre-registered — they&apos;ll be here when it kicks off.</p>
      )}
      <button type="button" onClick={handleDownloadIcs} className="btn-secondary btn-fit text-sm mx-auto">
        📅 Add to calendar
      </button>
    </div>
  )
}
