'use client'

/**
 * YourUpcomingGamesStrip — home "Your upcoming games" section (web).
 *
 * Two sources merge into the strip:
 *   1. RSVPs from /api/rsvps/mine, keyed by the browser push subscription
 *      endpoint (Phase B identity).
 *   2. Scheduled games I host — discovered by scanning localStorage for
 *      `game_host_*` tokens and asking Supabase which of those games are
 *      still `status='scheduled'`.
 * Auto-hides when both sets are empty. Above 3 rows collapses to "See all
 * (N)" and expands in place, keeping the home band tight for most visits.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'

type UpcomingRow = {
  id: string
  title: string | null
  game_type: string
  status: string
  scheduled_at: string | null
  /** True when I hold the local host token for this row — routes to /host
   *  instead of /game and gets a "You're hosting" badge. */
  hosting?: boolean
}

const HOST_TOKEN_PREFIX = 'game_host_'
const COLLAPSE_THRESHOLD = 3

function readHostedCodes(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(HOST_TOKEN_PREFIX)) continue
      const code = key.slice(HOST_TOKEN_PREFIX.length).toUpperCase()
      if (code) out.push(code)
    }
    return out
  } catch {
    return []
  }
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

async function fetchHostedScheduled(): Promise<UpcomingRow[]> {
  const codes = readHostedCodes()
  if (codes.length === 0) return []
  const { data } = await supabase
    .from('games')
    .select('id, title, game_type, status, scheduled_at')
    .in('id', codes)
    .eq('status', 'scheduled')
  return (data ?? []).map((r) => ({ ...(r as UpcomingRow), hosting: true }))
}

function mergeRows(rsvped: UpcomingRow[], hosted: UpcomingRow[]): UpcomingRow[] {
  // Host rows win when the same game is in both sets — that's the more
  // actionable link. Sort chronologically so "up next" is first.
  const seen = new Set<string>()
  const merged: UpcomingRow[] = []
  for (const r of hosted) {
    seen.add(r.id)
    merged.push(r)
  }
  for (const r of rsvped) {
    if (seen.has(r.id)) continue
    merged.push(r)
  }
  return merged.sort((a, b) => {
    const ax = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
    const bx = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
    return ax - bx
  })
}

export function YourUpcomingGamesStrip() {
  const [rows, setRows] = useState<UpcomingRow[] | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const endpoint = await readCurrentEndpoint()
      const [rsvped, hosted] = await Promise.all([
        (async (): Promise<UpcomingRow[]> => {
          if (!endpoint) return []
          try {
            const res = await fetch(`/api/rsvps/mine?tokenKey=${encodeURIComponent(endpoint)}`, { cache: 'no-store' })
            if (!res.ok) return []
            const data = (await res.json()) as { upcoming: UpcomingRow[] }
            return data.upcoming ?? []
          } catch {
            return []
          }
        })(),
        fetchHostedScheduled(),
      ])
      if (!cancelled) setRows(mergeRows(rsvped, hosted))
    }
    void load()
    const onFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  const visible = useMemo(() => {
    if (!rows) return []
    return expanded ? rows : rows.slice(0, COLLAPSE_THRESHOLD)
  }, [rows, expanded])

  if (!rows || rows.length === 0) return null
  const hiddenCount = rows.length - visible.length

  return (
    <section className="fr-band fr-band--tight">
      <div className="mk-wrap">
        <h2 className="mb-3 text-lg font-black tracking-tight" style={{ color: 'var(--text)' }}>
          Your upcoming games
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((r) => {
            const cfg = gameTypeConfig(parseGameType(r.game_type))
            const href = r.hosting ? `/host/${r.id}` : `/game/${r.id}`
            return (
              <Link
                key={r.id}
                href={href}
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
                    {r.hosting ? (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                        style={{
                          color: 'var(--primary)',
                          background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                        }}
                      >
                        Hosting
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    📆 {formatScheduled(r.scheduled_at)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
        {hiddenCount > 0 ? (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              See all ({rows.length}) →
            </button>
          </div>
        ) : expanded && rows.length > COLLAPSE_THRESHOLD ? (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-sm font-semibold text-muted hover:text-body"
            >
              Show fewer
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
