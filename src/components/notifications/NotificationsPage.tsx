'use client'

/**
 * Web /notifications page — per-game-type subscription toggles + quiet hours.
 *
 * Mirrors apps/mobile/app/notifications.tsx. Reuses the existing sw.js +
 * VAPID + push-client. On iOS Safari (non-standalone) shows an inline
 * Add-to-Home-Screen tip — web push only reaches PWA-installed iOS.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import { isIos, isStandalone, pushSupported } from '@/lib/push-client'
import { authHeaders } from '@/lib/auth-headers'

type QuietHours = {
  mode: 'off' | 'quiet' | 'available'
  startMinutes: number | null
  endMinutes: number | null
  timezone: string | null
}

type Snapshot = {
  subscribedGameTypes: string[]
  quietHours: QuietHours
  countsByGameType: Record<string, number>
}

const GAME_TYPES = [...GAME_TYPE_OPTIONS].sort((a, b) => gameTypeConfig(a).label.localeCompare(gameTypeConfig(b).label))

function formatMinutes(m: number | null): string {
  if (m == null) return ''
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function parseMinutes(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function ensureWebPushSubscription(): Promise<PushSubscription | null> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !pushSupported()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }
  return sub
}

export function NotificationsPage({ preselectGameType }: { preselectGameType?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenKey, setTokenKey] = useState<string | null>(null)
  const [webKeys, setWebKeys] = useState<{ p256dh: string; auth: string } | null>(null)
  const [pendingType, setPendingType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsIosInstall, setNeedsIosInstall] = useState(false)
  const [search, setSearch] = useState('')

  // Read the existing push subscription on mount without prompting. If the
  // browser already has one, prime tokenKey + webKeys so toggle-on/off works
  // without another Notification.requestPermission() round-trip.
  useEffect(() => {
    setNeedsIosInstall(isIos() && !isStandalone())
    let cancelled = false
    void (async () => {
      try {
        if (pushSupported() && Notification.permission === 'granted') {
          const registration = await navigator.serviceWorker.getRegistration()
          const sub = registration ? await registration.pushManager.getSubscription() : null
          if (!cancelled && sub) {
            const json = sub.toJSON()
            setTokenKey(sub.endpoint)
            if (json.keys?.p256dh && json.keys?.auth) {
              setWebKeys({ p256dh: json.keys.p256dh, auth: json.keys.auth })
            }
          }
        }
      } catch {
        // No existing subscription is fine — we'll create one on first toggle.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch snapshot whenever we have a tokenKey (or once with null to get the
  // 24h counts even for unsubscribed visitors — they still see how active
  // each game type is before opting in).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const params = tokenKey ? `?tokenKey=${encodeURIComponent(tokenKey)}` : '?tokenKey=__anon__'
        const res = await fetch(`/api/notifications${params}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('load failed')
        const data = (await res.json()) as Snapshot
        if (!cancelled) setSnapshot(data)
      } catch {
        if (!cancelled)
          setSnapshot({
            subscribedGameTypes: [],
            quietHours: { mode: 'off', startMinutes: null, endMinutes: null, timezone: null },
            countsByGameType: {},
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tokenKey])

  const subscribed = useMemo(() => new Set(snapshot?.subscribedGameTypes ?? []), [snapshot])
  const counts = snapshot?.countsByGameType ?? {}
  const quiet = snapshot?.quietHours ?? { mode: 'off', startMinutes: null, endMinutes: null, timezone: null }

  const ensureToken = useCallback(async (): Promise<{
    endpoint: string
    keys: { p256dh: string; auth: string }
  } | null> => {
    if (tokenKey && webKeys) return { endpoint: tokenKey, keys: webKeys }
    const sub = await ensureWebPushSubscription()
    if (!sub) return null
    const json = sub.toJSON()
    if (!json.keys?.p256dh || !json.keys?.auth) return null
    const keys = { p256dh: json.keys.p256dh, auth: json.keys.auth }
    setTokenKey(sub.endpoint)
    setWebKeys(keys)
    return { endpoint: sub.endpoint, keys }
  }, [tokenKey, webKeys])

  const onToggle = useCallback(
    async (gameType: string, next: boolean) => {
      setError(null)
      setPendingType(gameType)
      try {
        const authed = await ensureToken()
        if (!authed) {
          if (isIos() && !isStandalone()) {
            setError('Add FateRound to your Home Screen first — iOS Safari only sends push to installed PWAs.')
          } else {
            setError('Turn on browser notifications to subscribe.')
          }
          return
        }
        if (next) {
          const res = await fetch('/api/notifications', {
            method: 'POST',
            // Bearer identifies this device with the signed-in profile so the
            // fanout can skip pushing a game the same profile just opened.
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({
              channel: 'web',
              tokenKey: authed.endpoint,
              gameType,
              timezone: deviceTimezone(),
              webKeys: authed.keys,
            }),
          })
          if (!res.ok) throw new Error((await res.json()).error || 'subscribe failed')
          setSnapshot((s) => (s ? { ...s, subscribedGameTypes: [...s.subscribedGameTypes, gameType] } : s))
        } else {
          await fetch('/api/notifications', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenKey: authed.endpoint, gameType }),
          })
          setSnapshot((s) =>
            s ? { ...s, subscribedGameTypes: s.subscribedGameTypes.filter((t) => t !== gameType) } : s
          )
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Try again in a moment.')
      } finally {
        setPendingType(null)
      }
    },
    [ensureToken]
  )

  const onQuietChange = useCallback(
    async (patch: Partial<QuietHours>) => {
      // Persist locally right away so the UI feels responsive even before we
      // have a device row on the server. If no token yet, prompt for one — a
      // quiet-hours setting only makes sense once a device is subscribed.
      const next = { ...quiet, ...patch }
      setSnapshot((s) => (s ? { ...s, quietHours: next } : s))
      let effectiveToken = tokenKey
      if (!effectiveToken) {
        const authed = await ensureToken()
        if (!authed) {
          // The user declined notification permission; keep the local UI
          // state but flag it — the server won't have a row to persist to.
          setError('Turn on browser notifications to save quiet hours across devices.')
          return
        }
        effectiveToken = authed.endpoint
      }
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenKey: effectiveToken, ...patch, timezone: deviceTimezone() }),
      }).catch(() => {})
    },
    [quiet, tokenKey, ensureToken]
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12 space-y-4">
      <header className="text-center space-y-1">
        <p className="text-xs font-black uppercase tracking-[2px] text-[var(--primary)]">🔔 Get pinged</p>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">
          When your favourite games open
        </h1>
        <p className="text-sm text-muted max-w-md mx-auto">
          Pick the games you want a heads-up about. We only ping you when someone opens a new Public game.
        </p>
      </header>

      {needsIosInstall ? (
        <div className="glass-card !p-4 text-sm">
          <p className="font-semibold text-body">Install FateRound first (iOS Safari)</p>
          <p className="text-muted mt-1">
            iOS delivers web push only to home-screen apps. Tap the Share icon, then <b>Add to Home Screen</b>, then
            reopen this page from the app icon to subscribe. On Android, iOS Chrome, or desktop Chrome/Firefox/Edge this
            isn’t needed — just toggle a game on.
          </p>
        </div>
      ) : null}

      <section className="glass-card !p-4 space-y-3">
        <h2 className="font-bold text-body">Quiet hours</h2>
        <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
          {(['off', 'quiet', 'available'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => void onQuietChange({ mode })}
              className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
                quiet.mode === mode ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {quiet.mode !== 'off' ? (
          <div className="flex gap-3">
            <label className="flex-1 space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">From</span>
              <input
                type="time"
                value={formatMinutes(quiet.startMinutes)}
                onChange={(e) => {
                  const m = parseMinutes(e.target.value)
                  if (m != null) void onQuietChange({ startMinutes: m })
                }}
                className="input-field w-full"
              />
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">To</span>
              <input
                type="time"
                value={formatMinutes(quiet.endMinutes)}
                onChange={(e) => {
                  const m = parseMinutes(e.target.value)
                  if (m != null) void onQuietChange({ endMinutes: m })
                }}
                className="input-field w-full"
              />
            </label>
          </div>
        ) : null}
        <p className="text-xs text-faint">
          {quiet.mode === 'quiet'
            ? 'Pushes during this window are dropped, not queued — a game happening at 2pm is already over by 6pm.'
            : quiet.mode === 'available'
              ? 'Only pushes inside this window are delivered.'
              : 'All pings delivered whenever they fire.'}
        </p>
      </section>

      {error ? <p className="text-sm text-red-500 text-center">{error}</p> : null}

      <div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search games…"
          className="input-field w-full"
          aria-label="Filter games"
        />
      </div>

      <section className="glass-card !p-0 overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted">Loading…</p>
        ) : (
          (() => {
            const q = search.trim().toLowerCase()
            const filtered = q
              ? GAME_TYPES.filter((gt) => gameTypeConfig(gt).label.toLowerCase().includes(q))
              : GAME_TYPES
            if (filtered.length === 0) {
              return <p className="p-6 text-center text-sm text-muted">No games match “{search}”.</p>
            }
            return filtered.map((gameType, i) => {
              const cfg = gameTypeConfig(gameType)
              const isOn = subscribed.has(gameType)
              const count = counts[gameType] ?? 0
              return (
                <div
                  key={gameType}
                  className={`flex items-center gap-3 p-4 ${i < filtered.length - 1 ? 'border-b border-[var(--border)]/50' : ''}`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-xl"
                    style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
                  >
                    {cfg.card.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-body">{cfg.label}</p>
                    <p className="text-xs text-muted">
                      {count > 0 ? `${count} game${count === 1 ? '' : 's'} today` : 'No games today'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onToggle(gameType, !isOn)}
                    disabled={pendingType === gameType}
                    aria-pressed={isOn}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      isOn ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                        isOn ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              )
            })
          })()
        )}
      </section>

      <p className="text-center text-xs text-faint">
        <Link href="/" className="hover:text-body transition-colors">
          ← Back to home
        </Link>
      </p>
      {preselectGameType ? <span data-preselect={preselectGameType} className="hidden" /> : null}
    </div>
  )
}
