'use client'

/**
 * ScheduledHostWaitingScreen — premium waiting UI the host lands on while a
 * scheduled game hasn't opened yet.
 *
 * Mounts on /host/[code] when game.status='scheduled' in place of the normal
 * per-game host chrome (which otherwise flashes a one-liner "Waiting for the
 * round to begin"). Shows a big countdown, the share link so the host can
 * pull friends in, an "Open lobby now" shortcut, and the full reschedule /
 * cancel / transfer controls via ScheduledHostActionsPanel.
 *
 * Polls the games row every 5s so the moment the T-0 cron flips status to
 * 'waiting' the screen unmounts and the normal host view takes over.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { ScheduledHostActionsPanel } from '@/components/notifications/ScheduledHostActionsPanel'
import { ShareInviteButton } from '@/components/ShareInviteButton'

type ScheduledGame = {
  id: string
  title: string | null
  game_type: string
  status: 'scheduled' | 'waiting' | 'active' | 'finished'
  scheduled_at: string | null
  is_public: boolean
}

function formatFull(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function countdownParts(target: string | null | undefined, now: number) {
  if (!target) return { days: 0, hours: 0, minutes: 0, seconds: 0, overdue: true }
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, overdue: true }
  const total = Math.floor(diff / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return { days, hours, minutes, seconds, overdue: false }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function ScheduledHostWaitingScreen({
  gameCode,
  hostToken,
  initialGame,
}: {
  gameCode: string
  hostToken: string | null
  initialGame: ScheduledGame
}) {
  const [game, setGame] = useState<ScheduledGame>(initialGame)
  const [now, setNow] = useState(() => Date.now())
  const [rsvpCount, setRsvpCount] = useState(0)
  const [openingNow, setOpeningNow] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('games')
        .select('id, title, game_type, status, scheduled_at, is_public')
        .eq('id', gameCode)
        .maybeSingle()
      if (cancelled || !data) return
      setGame(data as ScheduledGame)
      if (data.status !== 'scheduled') {
        // The T-0 cron flipped us to 'waiting' — reload the host page so the
        // normal per-game host view mounts.
        window.location.reload()
      }
    }
    const gameTimer = setInterval(load, 5000)
    const nowTimer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      clearInterval(gameTimer)
      clearInterval(nowTimer)
    }
  }, [gameCode])

  useEffect(() => {
    let cancelled = false
    const loadCount = async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/rsvp?tokenKey=__anon__`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { rsvpCount?: number }
        if (!cancelled) setRsvpCount(data.rsvpCount ?? 0)
      } catch {
        // Ignore — count just stays at 0.
      }
    }
    void loadCount()
    const t = setInterval(loadCount, 10_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [gameCode])

  const openLobbyNow = useCallback(async () => {
    if (!hostToken) return
    setOpeningNow(true)
    setOpenError(null)
    try {
      const res = await fetch(`/api/games/${gameCode}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, scheduled_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not open the lobby')
      // The T-0 cron will flip status shortly; force a reload so the normal
      // host view mounts instead of waiting for the next poll tick.
      window.location.reload()
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : 'Could not open the lobby')
      setOpeningNow(false)
    }
  }, [gameCode, hostToken])

  const cfg = useMemo(() => gameTypeConfig(parseGameType(game.game_type)), [game.game_type])
  const cd = useMemo(() => countdownParts(game.scheduled_at, now), [game.scheduled_at, now])
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/game/${gameCode}` : `/game/${gameCode}`
  const lobbyOpensAt = game.scheduled_at ? new Date(new Date(game.scheduled_at).getTime() - 15 * 60 * 1000) : null

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="text-6xl">{cfg.card.emoji}</div>
          <p className="text-xs font-black uppercase tracking-[2px]" style={{ color: 'var(--primary)' }}>
            Scheduled · You’re the host
          </p>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--text)' }}>
            {game.title?.trim() || cfg.label}
          </h1>
          <p className="text-sm text-muted">{formatFull(game.scheduled_at)}</p>
        </div>

        <div className="glass-card !p-5 text-center space-y-3">
          <p className="text-xs font-black uppercase tracking-wide text-muted">
            {cd.overdue ? 'Opening any second…' : 'Starts in'}
          </p>
          {cd.overdue ? (
            <p className="text-3xl font-black" style={{ color: 'var(--primary)' }}>
              Now
            </p>
          ) : (
            <div className="flex items-end justify-center gap-3 sm:gap-4 font-black" style={{ color: 'var(--text)' }}>
              {cd.days > 0 ? <TimeCell value={cd.days} label={cd.days === 1 ? 'day' : 'days'} /> : null}
              <TimeCell value={cd.days > 0 ? cd.hours : cd.hours} label="hr" />
              <TimeCell value={cd.minutes} label="min" pad />
              <TimeCell value={cd.seconds} label="sec" pad muted />
            </div>
          )}
          <p className="text-xs text-faint pt-1">
            Lobby opens <span className="font-bold text-body">15 minutes before</span> the start
            {lobbyOpensAt ? ` (${formatShortTime(lobbyOpensAt.toISOString())})` : ''}.
          </p>
        </div>

        <div className="glass-card !p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-body">Invite your people</p>
            <p className="text-xs text-muted">
              {rsvpCount === 0 ? 'No RSVPs yet' : `${rsvpCount} RSVP${rsvpCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Game code</p>
            <p className="text-xl font-black tracking-[3px]" style={{ color: 'var(--text)' }}>
              {gameCode}
            </p>
          </div>
          <ShareInviteButton
            url={shareUrl}
            text={`Join my ${cfg.label} game on FateRound — ${formatFull(game.scheduled_at)}. Tap to RSVP:`}
            label="Share invite"
            copyLabel="Copy invite link"
            className="w-full text-sm py-2"
          />
          <p className="text-xs text-faint">
            {game.is_public
              ? 'Public: also shows up in Browse → Upcoming for anyone nearby.'
              : 'Private: only people with this link can RSVP.'}
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={openingNow || !hostToken}
            onClick={() => void openLobbyNow()}
            className="btn-primary w-full text-sm py-3 disabled:opacity-60"
          >
            {openingNow ? 'Opening…' : 'Open lobby now'}
          </button>
          {openError ? <p className="text-xs text-red-500 text-center">{openError}</p> : null}
          <p className="text-xs text-faint text-center">
            Skips the countdown and pushes everyone who RSVP’d that it’s go time.
          </p>
        </div>

        <ScheduledHostActionsPanel gameCode={gameCode} currentScheduledAt={game.scheduled_at} />
      </div>
    </div>
  )
}

function TimeCell({
  value,
  label,
  pad: shouldPad,
  muted,
}: {
  value: number
  label: string
  pad?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="text-4xl sm:text-5xl tabular-nums leading-none"
        style={{ color: muted ? 'var(--text-muted)' : 'var(--primary)' }}
      >
        {shouldPad ? pad(value) : value}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</span>
    </div>
  )
}
