'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatCountdown, formatScheduledFor } from '@/lib/tournament-schedule'
import type { Tournament } from '@/types/tournament'

/**
 * Home-page reminder card: any scheduled tournament this device has joined (or
 * is hosting) that hasn't ended yet gets a row here. So a player who
 * pre-registered days ago and lands on fateround.com is reminded of what's
 * coming — third layer of "you won't forget" on top of the calendar alarms
 * baked into the .ics and (eventually) push notifications.
 *
 * Silent when the device has no matches — a first-time visitor sees nothing.
 * Whole component is client-side because localStorage is the source of truth
 * for "which tournaments is this device in".
 */
type UpcomingRow = {
  tournament: Tournament
  path: string
  role: 'host' | 'player'
}

const PLAYER_TOKEN_PREFIX = 'tournament_ptoken_'
const HOST_TOKEN_PREFIX = 'tournament_host_'

function collectMemberships(): Array<{ code: string; role: 'host' | 'player'; token: string }> {
  const out: Array<{ code: string; role: 'host' | 'player'; token: string }> = []
  if (typeof window === 'undefined') return out
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key) continue
    if (key.startsWith(HOST_TOKEN_PREFIX)) {
      const token = window.localStorage.getItem(key) ?? ''
      if (token) out.push({ code: key.slice(HOST_TOKEN_PREFIX.length), role: 'host', token })
    } else if (key.startsWith(PLAYER_TOKEN_PREFIX)) {
      const token = window.localStorage.getItem(key) ?? ''
      if (token) out.push({ code: key.slice(PLAYER_TOKEN_PREFIX.length), role: 'player', token })
    }
  }
  // De-dup: if the same tournament shows up as both host and player (host who
  // also plays), host role wins — that's the more powerful link.
  const byCode = new Map<string, { code: string; role: 'host' | 'player'; token: string }>()
  for (const m of out) {
    const existing = byCode.get(m.code)
    if (!existing || m.role === 'host') byCode.set(m.code, m)
  }
  return [...byCode.values()]
}

export function UpcomingTournamentsCard() {
  const [rows, setRows] = useState<UpcomingRow[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())

  // One-shot fetch on mount: read localStorage, fan out to the tournament
  // GET endpoint for each membership, keep only those that are scheduled and
  // not yet finished. Prunes localStorage entries whose tournaments no longer
  // exist (server 404), so a device stops carrying stale codes forever.
  useEffect(() => {
    const memberships = collectMemberships()
    if (memberships.length === 0) return
    let cancelled = false
    ;(async () => {
      const fetched = await Promise.all(
        memberships.map(async (m) => {
          try {
            const res = await fetch(`/api/tournaments/${m.code}`)
            if (res.status === 404) {
              // Tournament gone — remove the stale localStorage entry so this
              // device stops pinging for it every home-page visit.
              window.localStorage.removeItem(
                m.role === 'host' ? `${HOST_TOKEN_PREFIX}${m.code}` : `${PLAYER_TOKEN_PREFIX}${m.code}`
              )
              return null
            }
            if (!res.ok) return null
            const data = await res.json()
            const t = data.tournament as Tournament | undefined
            if (!t) return null
            if (t.status === 'finished') return null
            // Only surface scheduled tournaments here — non-scheduled
            // tournaments the user joined weren't meant as calendar events,
            // so nagging them on the home page would be noise.
            if (!t.scheduled_at) return null
            const suffix =
              m.role === 'host' ? `?host=${encodeURIComponent(m.token)}` : `?player=${encodeURIComponent(m.token)}`
            return { tournament: t, path: `/tournament/${t.id}${suffix}`, role: m.role } as UpcomingRow
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      const surviving = fetched.filter((r): r is UpcomingRow => r !== null)
      // Nearest start first.
      surviving.sort((a, b) => {
        const ta = a.tournament.scheduled_at ? Date.parse(a.tournament.scheduled_at) : Infinity
        const tb = b.tournament.scheduled_at ? Date.parse(b.tournament.scheduled_at) : Infinity
        return ta - tb
      })
      setRows(surviving)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Re-tick countdown every 30 s — home page doesn't need second-level
  // precision and this keeps the tab idle-friendly.
  useEffect(() => {
    if (rows.length === 0) return
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [rows.length])

  if (rows.length === 0) return null

  return (
    <section className="fr-band fr-band--tight">
      <div className="mk-wrap">
        <div className="glass-card p-5 space-y-3" style={{ borderLeft: '4px solid var(--primary)' }}>
          <p className="label-caps">Your upcoming events</p>
          <ul className="space-y-2">
            {rows.map((r) => {
              const deltaMs = r.tournament.scheduled_at ? Date.parse(r.tournament.scheduled_at) - nowMs : 0
              const live = r.tournament.status === 'active'
              return (
                <li key={r.tournament.id}>
                  <Link
                    href={r.path}
                    className="rounded-xl border border-theme px-4 py-3 flex items-center gap-3 hover:opacity-90"
                    style={{ background: 'var(--surface-inset-bg)' }}
                  >
                    {r.tournament.branding?.logoUrl && (
                       
                      <img
                        src={r.tournament.branding.logoUrl}
                        alt=""
                        className="h-10 w-10 object-contain rounded-md"
                        style={{ background: 'var(--surface-bg, #fff)' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-sm font-semibold truncate">{r.tournament.title}</p>
                      <p className="text-faint text-xs">
                        {live ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Live now</span>
                        ) : r.tournament.scheduled_at ? (
                          <>
                            {formatScheduledFor(r.tournament.scheduled_at)}
                            <span> · </span>
                            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatCountdown(deltaMs)}</span>
                          </>
                        ) : (
                          'Ready to start'
                        )}
                        {r.role === 'host' && <span className="text-faint"> · you host</span>}
                      </p>
                    </div>
                    <span className="text-faint text-xs">→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
