'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Tournament } from '@/types/tournament'
import { buildTournamentIcs, formatCountdown, formatScheduledFor, icsBlob } from '@/lib/tournament-schedule'
import { estimatePlaylistSeconds, TIMING_PLAYER_FALLBACK } from '@/lib/tournament-timing'
import { downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { shareOrigin, tournamentHostUrl, tournamentInviteUrl, tournamentPlayerResumeUrl } from '@/lib/site'
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
export function ScheduledEventCard({
  tournament,
  playerCount,
  presentPlayerCount = 0,
  playerToken,
  hostToken,
}: {
  tournament: Tournament
  playerCount: number
  /** Optional realtime-presence count — pre-registered players whose tab is
   *  open right now. Renders as "· N here now" alongside the pre-registered
   *  total when non-zero, so the host sees the real turnout, not just who
   *  signed up. Omit to hide. */
  presentPlayerCount?: number
  /** This viewer's tournament player resume token, if they've joined. Baked
   *  into the .ics URL so tapping the calendar reminder auto-restores their
   *  seat — even on a different device. */
  playerToken?: string | null
  /** This viewer's host token if they're the host on this device. Same idea:
   *  calendar reminder → tap → back in as host with no re-auth. */
  hostToken?: string | null
}) {
  const { success, error } = useToast()
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Re-tick every second so the countdown stays live. Cheap — one setInterval,
  // one setState of a number; the render is a formatted string.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Which URL goes into the calendar file. Host token wins if both are set on
  // the same device (rare — cross-device host + join). Otherwise the player
  // resume link, otherwise the generic anonymous invite (still works — just
  // won't auto-restore a seat on a new device).
  const role: 'host' | 'player' | 'anon' = hostToken ? 'host' : playerToken ? 'player' : 'anon'
  const origin = shareOrigin()
  const personalisedUrl =
    role === 'host'
      ? tournamentHostUrl(tournament.id, hostToken!, origin)
      : role === 'player'
        ? tournamentPlayerResumeUrl(tournament.id, playerToken!, origin)
        : tournamentInviteUrl(tournament.id, origin)

  const handleDownloadIcs = useCallback(() => {
    if (!tournament.scheduled_at) return
    try {
      const duration = tournament.game_queue
        ? estimatePlaylistSeconds(tournament.game_queue, playerCount || TIMING_PLAYER_FALLBACK)
        : 3600
      const ics = buildTournamentIcs(tournament, personalisedUrl, duration, new Date(nowMs).toISOString())
      downloadBlobAsFile(icsBlob(ics), `${shareFilenameStem(tournament.title)}.ics`)
      success(
        role === 'anon'
          ? "Calendar file downloaded — you'll be reminded 1h + 10 min before start"
          : 'Personal reminder saved — tapping the calendar alert takes you straight back in'
      )
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not create calendar file')
    }
  }, [tournament, playerCount, nowMs, personalisedUrl, role, success, error])

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
        <p className="text-faint text-xs">
          {playerCount} pre-registered
          {presentPlayerCount > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{presentPlayerCount} here now</span>
            </>
          )}
        </p>
      )}
      <button type="button" onClick={handleDownloadIcs} className="btn-secondary btn-fit text-sm mx-auto">
        📅{' '}
        {role === 'host' ? 'Add to my calendar (host)' : role === 'player' ? 'Add to my calendar' : 'Add to calendar'}
      </button>
      <p className="text-faint text-xs">
        Your calendar will alert you 1 hour before, 10 minutes before, and at start.
        {role === 'player' && ' Tapping the alert opens the lobby with your seat still saved.'}
        {role === 'host' && ' Tapping the alert restores your host controls.'}
      </p>
    </div>
  )
}
