'use client'

/**
 * YourUpcomingGamesStrip — home "Your upcoming games" section (web).
 *
 * Reads the caller's RSVPs from /api/rsvps/mine, keyed by the browser push
 * subscription endpoint (Phase B identity). Auto-hides for visitors who
 * haven't RSVP'd to anything — most visits.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'

type UpcomingRow = {
  id: string
  title: string | null
  game_type: string
  status: string
  scheduled_at: string | null
}

function formatScheduled(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

async function readCurrentEndpoint(): Promise<string | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null
  if (Notification.permission !== 'granted') return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const sub = registration ? await registration.pushManager.getSubscription() : null
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

export function YourUpcomingGamesStrip() {
  const [rows, setRows] = useState<UpcomingRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const endpoint = await readCurrentEndpoint()
      if (!endpoint) {
        if (!cancelled) setRows([])
        return
      }
      try {
        const res = await fetch(`/api/rsvps/mine?tokenKey=${encodeURIComponent(endpoint)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { upcoming: UpcomingRow[] }
        if (!cancelled) setRows(data.upcoming ?? [])
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    const onFocus = () => {
      // Refetch on tab focus so a cancel or reschedule from another device
      // reflects promptly.
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void (async () => {
          const endpoint = await readCurrentEndpoint()
          if (!endpoint) return
          const res = await fetch(`/api/rsvps/mine?tokenKey=${encodeURIComponent(endpoint)}`, { cache: 'no-store' })
          if (res.ok) setRows(((await res.json()).upcoming as UpcomingRow[]) ?? [])
        })()
      }
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  if (!rows || rows.length === 0) return null

  return (
    <section className="fr-band fr-band--tight">
      <div className="mk-wrap">
        <h2 className="mb-3 text-lg font-black tracking-tight" style={{ color: 'var(--text)' }}>
          Your upcoming games
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => {
            const cfg = gameTypeConfig(parseGameType(r.game_type))
            return (
              <Link
                key={r.id}
                href={`/game/${r.id}`}
                className="fr-card flex items-center gap-3 !p-3 hover:brightness-105"
                style={{ '--accent': cfg.card.accent } as React.CSSProperties}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-xl"
                  style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
                >
                  {cfg.card.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {cfg.label}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    📆 {formatScheduled(r.scheduled_at)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
