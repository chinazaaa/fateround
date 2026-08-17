'use client'

/**
 * ScheduledGameOverlay — web /game/[code] Phase C UI.
 *
 * Full-screen takeover while status='scheduled' (RSVP button + countdown),
 * and a floating "I'm ready" prompt post-open for RSVPers who haven't
 * confirmed yet. Mounts once on src/app/game/[code]/page.tsx so every game
 * type inherits the same scheduling flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { pushSupported } from '@/lib/push-client'

type ScheduledGame = {
  id: string
  title: string | null
  game_type: string
  status: 'scheduled' | 'waiting' | 'active' | 'finished'
  scheduled_at: string | null
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

function countdownLabel(target: string | null | undefined, now: number): string {
  if (!target) return ''
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return 'Opening now…'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `Opens in ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `Opens in ${hours} h`
  const days = Math.floor(hours / 24)
  return `Opens in ${days} days`
}

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function ensureSubscription(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | null> {
  if (!VAPID_KEY || !pushSupported()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
    })
  }
  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

async function readEndpoint(): Promise<string | null> {
  if (!pushSupported() || Notification.permission !== 'granted') return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const sub = registration ? await registration.pushManager.getSubscription() : null
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

export function ScheduledGameOverlay({ gameCode }: { gameCode: string }) {
  const [game, setGame] = useState<ScheduledGame | null>(null)
  const [rsvped, setRsvped] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Poll game state (status + scheduled_at) every 5s so the takeover unmounts
  // as soon as the T-0 tick flips status→waiting.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const { data } = await supabase
        .from('games')
        .select('id, title, game_type, status, scheduled_at')
        .eq('id', gameCode)
        .maybeSingle()
      if (cancelled) return
      if (data) setGame(data as ScheduledGame)
    }
    void check()
    const t = setInterval(check, 5000)
    const nowTimer = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      cancelled = true
      clearInterval(t)
      clearInterval(nowTimer)
    }
  }, [gameCode])

  const loadRsvp = useCallback(async () => {
    const endpoint = await readEndpoint()
    const res = await fetch(
      `/api/games/${gameCode.toUpperCase()}/rsvp?tokenKey=${encodeURIComponent(endpoint ?? '__anon__')}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return
    const data = await res.json()
    setRsvped(!!data.rsvped)
    setConfirmed(!!data.confirmed)
    setRsvpCount(data.rsvpCount ?? 0)
  }, [gameCode])

  useEffect(() => {
    void loadRsvp()
  }, [loadRsvp])

  const onRsvpToggle = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (rsvped) {
        const endpoint = await readEndpoint()
        if (endpoint) {
          await fetch(`/api/games/${gameCode.toUpperCase()}/rsvp`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenKey: endpoint }),
          })
        }
        setRsvped(false)
        setRsvpCount((n) => Math.max(0, n - 1))
      } else {
        const authed = await ensureSubscription()
        if (!authed) {
          throw new Error('Enable browser notifications to RSVP — we need a way to remind you.')
        }
        const res = await fetch(`/api/games/${gameCode.toUpperCase()}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'web',
            tokenKey: authed.endpoint,
            webKeys: authed.keys,
            timezone: (() => {
              try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone
              } catch {
                return undefined
              }
            })(),
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Could not RSVP.')
        setRsvped(true)
        setRsvpCount((n) => n + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.')
    } finally {
      setBusy(false)
    }
  }, [gameCode, rsvped])

  const onConfirmReady = useCallback(async () => {
    const endpoint = await readEndpoint()
    if (!endpoint) return
    await fetch(`/api/games/${gameCode.toUpperCase()}/rsvp/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenKey: endpoint }),
    })
    setConfirmed(true)
  }, [gameCode])

  const cfg = useMemo(() => (game ? gameTypeConfig(parseGameType(game.game_type)) : null), [game])

  if (!game || !cfg) return null

  // Post-open confirm-ready floating prompt (only when the caller has an
  // unconfirmed RSVP). Rendered above the normal game view.
  if (game.status === 'waiting' && rsvped && !confirmed) {
    return (
      <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
        <div className="glass-card-strong flex max-w-md items-center gap-3 !p-3 pointer-events-auto">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-body">You RSVP’d 🎉</p>
            <p className="text-xs text-muted">Tap “I’m ready” to take a seat. Unconfirmed RSVPs drop after 10 min.</p>
          </div>
          <button
            type="button"
            onClick={() => void onConfirmReady()}
            className="btn-primary btn-fit px-3 py-1.5 text-xs"
          >
            I’m ready
          </button>
        </div>
      </div>
    )
  }

  if (game.status !== 'scheduled') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)] p-4">
      <div className="mx-auto w-full max-w-md space-y-6 text-center">
        <Link href="/browse" className="inline-block text-sm font-semibold" style={{ color: 'var(--primary)' }}>
          ‹ Back to Browse
        </Link>
        <div className="space-y-2">
          <div className="text-5xl">{cfg.card.emoji}</div>
          <p className="text-xs font-black uppercase tracking-[2px]" style={{ color: 'var(--primary)' }}>
            Scheduled game
          </p>
          <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>
            {cfg.label}
          </h1>
          {game.scheduled_at ? (
            <>
              <p className="text-sm text-muted">{formatFull(game.scheduled_at)}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--primary)' }}>
                {countdownLabel(game.scheduled_at, now)}
              </p>
            </>
          ) : null}
        </div>
        <div className="glass-card !p-4 space-y-3 text-left">
          <p className="text-sm font-bold text-body">
            {rsvpCount === 0 ? 'Be the first to RSVP' : `${rsvpCount} ${rsvpCount === 1 ? 'person' : 'people'} RSVP’d`}
          </p>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button
            type="button"
            onClick={() => void onRsvpToggle()}
            disabled={busy}
            className={`w-full text-sm py-2 ${rsvped ? 'btn-secondary' : 'btn-primary'} disabled:opacity-60`}
          >
            {busy ? 'Working…' : rsvped ? 'RSVP’d — tap to cancel' : 'RSVP'}
          </button>
          <p className="text-xs text-faint">We’ll ping you 15 minutes before it opens (needs browser notifications).</p>
        </div>
      </div>
    </div>
  )
}
