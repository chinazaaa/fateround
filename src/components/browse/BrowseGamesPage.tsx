'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { supabase } from '@/lib/supabase'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { roomGameStatusLabel } from '@/components/rooms/room-game-display'
import { readHostToken } from '@/lib/host-session'
import { getPlayerSession } from '@/lib/utils'
import type { PublicGame } from '@/lib/game-browse'

const POLL_FALLBACK_MS = 15_000

type Tab = 'live' | 'upcoming'

export function BrowseGamesPage() {
  const [games, setGames] = useState<PublicGame[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  // gameCode → true when the caller's push endpoint has an RSVP on that game.
  // Only populated on the Upcoming tab; keeps the "RSVP" CTA from telling a
  // user who's already RSVP'd to RSVP again.
  const [rsvpedSet, setRsvpedSet] = useState<Set<string>>(() => new Set())
  // gameCode → true when this browser holds the host token for the game. Same
  // idea as `rsvpedSet` but for the "I created this" case — the host sees
  // "Open host panel" instead of "RSVP" on their own scheduled game.
  const [hostedSet, setHostedSet] = useState<Set<string>>(() => new Set())
  // gameCode → true when this browser has a live player session for the game
  // (set on join via setPlayerSession, cleared on leave). Powers the "Continue"
  // CTA on games the viewer has already joined.
  const [joinedSet, setJoinedSet] = useState<Set<string>>(() => new Set())

  const loadGames = useCallback(
    async (nextCursor?: string | null, silent = false) => {
      const loadingMore = !!nextCursor
      // Background refreshes (realtime / poll / tab-focus) run SILENTLY — they must not flip
      // the full-page loading state. The games subscription is table-wide, so a game changing
      // anywhere on the platform fires a refresh; if each one showed "Loading public games…",
      // the page would blank constantly and the empty state would never get to render. Only
      // the first load and "Load more" show a spinner.
      if (loadingMore) setLoadingMore(true)
      else if (!silent) setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '20' })
        if (nextCursor) params.set('cursor', nextCursor)
        if (tab === 'upcoming') params.set('status', 'scheduled')
        const res = await fetch(`/api/games?${params}`)
        if (!res.ok) throw new Error('Failed to load games')
        const d = await res.json()
        const rows: PublicGame[] = d.games ?? []
        setGames((prev) => (loadingMore ? [...prev, ...rows] : rows))
        setHasMore(!!d.hasMore)
        setCursor(d.nextCursor ?? null)
      } catch {
        if (!loadingMore && !silent) {
          setGames([])
          setHasMore(false)
          setCursor(null)
        }
      } finally {
        if (loadingMore) setLoadingMore(false)
        else if (!silent) setLoading(false)
      }
    },
    [tab]
  )

  useEffect(() => {
    void loadGames()
  }, [loadGames])

  // Best-effort per-card RSVP lookup for the Upcoming tab. Reads the browser's
  // existing push endpoint (no permission prompt) and asks the RSVP GET for
  // each scheduled game whether this device is on the list. Absent endpoint
  // → nothing to mark; that's fine, the CTA just stays "RSVP".
  // Host-token lookup runs synchronously (localStorage) any time the visible
  // scheduled list changes. Cheap enough to redo without special-casing.
  useEffect(() => {
    if (tab !== 'upcoming') {
      setHostedSet(new Set())
      return
    }
    const owned = games.filter((g) => g.status === 'scheduled').filter((g) => !!readHostToken(g.id))
    setHostedSet(new Set(owned.map((g) => g.id)))
  }, [tab, games])

  // Any visible game the browser already has a player session for gets the
  // "Continue" CTA. Reading getPlayerSession is a synchronous localStorage
  // per-key lookup so this stays cheap across the whole visible list.
  useEffect(() => {
    const joined = new Set<string>()
    for (const g of games) {
      if (getPlayerSession(g.id)) joined.add(g.id.toUpperCase())
    }
    setJoinedSet(joined)

    const handler = (e: Event) => {
      const code = (e as CustomEvent<{ gameCode: string }>).detail?.gameCode
      if (!code) return
      setJoinedSet((prev) => {
        const next = new Set(prev)
        if (getPlayerSession(code)) next.add(code.toUpperCase())
        else next.delete(code.toUpperCase())
        return next
      })
    }
    window.addEventListener('kmk-player-session', handler)
    return () => window.removeEventListener('kmk-player-session', handler)
  }, [games])

  useEffect(() => {
    if (tab !== 'upcoming') {
      setRsvpedSet(new Set())
      return
    }
    let cancelled = false
    const check = async () => {
      let endpoint: string | null = null
      try {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const registration = await navigator.serviceWorker.getRegistration()
        const sub = registration ? await registration.pushManager.getSubscription() : null
        endpoint = sub?.endpoint ?? null
      } catch {
        return
      }
      if (!endpoint || cancelled) return
      const scheduled = games.filter((g) => g.status === 'scheduled')
      if (scheduled.length === 0) return
      const results = await Promise.all(
        scheduled.map(async (g) => {
          try {
            const res = await fetch(`/api/games/${g.id.toUpperCase()}/rsvp?tokenKey=${encodeURIComponent(endpoint!)}`, {
              cache: 'no-store',
            })
            if (!res.ok) return null
            const data = (await res.json()) as { rsvped?: boolean }
            return data.rsvped ? g.id : null
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      setRsvpedSet(new Set(results.filter((x): x is string => x != null)))
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [tab, games])

  // Freshness: Realtime is primary; visibility + slow poll are fallbacks. Any change to a
  // game (new public game, status flip, finish) reloads the first page — cheap and simple.
  useEffect(() => {
    const channel = supabase
      .channel('public_games_browse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        void loadGames(null, true)
      })
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadGames(null, true)
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadGames(null, true)
    }, POLL_FALLBACK_MS)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [loadGames])

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 pointer-events-none border-b border-[var(--border)]/50 bg-[var(--background)]/90 backdrop-blur-md">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="mx-auto w-full max-w-[1080px] px-4 pt-16 pb-12">
        <div className="mx-auto max-w-xl text-center space-y-1">
          <div className="text-4xl">🌐</div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">Public Games</h1>
          <p className="text-muted text-sm">
            {tab === 'live'
              ? 'Games happening right now that anyone can jump into. Hosts choose to list a game publicly — private games stay code-only.'
              : 'Games scheduled to open soon. RSVP so we can ping you at T-15 minutes before it opens.'}
          </p>
        </div>

        <div className="mx-auto mt-4 flex max-w-sm rounded-xl border border-[var(--border)] overflow-hidden">
          {(['live', 'upcoming'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
              }`}
            >
              {t === 'live' ? 'Live now' : 'Upcoming'}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-muted text-center py-12">Loading public games…</p>
          ) : games.length === 0 ? (
            <div className="glass-card mx-auto max-w-md p-8 text-center space-y-3">
              <div className="text-3xl">🎲</div>
              <div className="space-y-1">
                <p className="text-base text-body font-semibold">No public games right now</p>
                <p className="text-sm text-muted">
                  Nothing’s being played publicly yet. Start a game and set it to Public — it’ll show up here for anyone
                  to find and join.
                </p>
              </div>
              <Link href="/" className="btn-primary btn-fit mx-auto px-5 text-sm py-2">
                Create a game
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {games.map((game) => {
                const cfg = gameTypeConfig(parseGameType(game.game_type))
                const isScheduled = game.status === 'scheduled'
                const isLobby = game.status === 'waiting'
                const isActive = game.status === 'active'
                const title = game.title?.trim()
                const titleLine = title && title.toLowerCase() !== cfg.label.toLowerCase() ? title : null
                const count =
                  game.max_players != null ? `${game.playerCount}/${game.max_players}` : `${game.playerCount}`
                const isFull = game.max_players != null && game.playerCount >= game.max_players
                const lateJoinable = isActive && game.allow_late_players === true && !isFull
                const scheduledLabel = game.scheduled_at
                  ? new Date(game.scheduled_at).toLocaleString(undefined, {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : null
                return (
                  <div
                    key={game.id}
                    className="fr-card flex flex-col gap-3 !p-4"
                    style={{ '--accent': cfg.card.accent } as React.CSSProperties}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl"
                        style={{ background: `color-mix(in srgb, ${cfg.card.accent} 16%, transparent)` }}
                      >
                        {cfg.card.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[15.5px] font-bold" style={{ color: 'var(--text)' }}>
                          {titleLine ?? cfg.label}
                        </h2>
                        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-faint)' }}>
                          {titleLine ? cfg.label : cfg.card.vibe}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {isScheduled ? (
                        <>📆 Opens {scheduledLabel}</>
                      ) : (
                        <>
                          {!isLobby && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                            </span>
                          )}
                          {roomGameStatusLabel(game.status)}
                          {lateJoinable ? ' · join or watch' : isFull ? ' · full' : ''}
                          {` · ${count} player${game.playerCount !== 1 ? 's' : ''}`}
                        </>
                      )}
                    </span>

                    {(() => {
                      const iAmHost = isScheduled && hostedSet.has(game.id)
                      const alreadyRsvped = isScheduled && rsvpedSet.has(game.id)
                      const iAmPlayer = !isScheduled && joinedSet.has(game.id.toUpperCase())
                      const href = iAmHost ? `/host/${game.id}` : `/game/${game.id}`
                      const label = iAmHost
                        ? 'You’re hosting · Open panel'
                        : isScheduled
                          ? alreadyRsvped
                            ? 'RSVP’d · View details'
                            : 'RSVP'
                          : iAmPlayer
                            ? 'Continue'
                            : isLobby
                              ? isFull
                                ? 'Watch'
                                : 'Join game'
                              : lateJoinable
                                ? 'Join game'
                                : 'Watch'
                      const styleClass = iAmHost
                        ? 'btn-primary'
                        : isScheduled
                          ? alreadyRsvped
                            ? 'btn-secondary'
                            : 'btn-primary'
                          : iAmPlayer
                            ? 'btn-primary'
                            : isLobby && !isFull
                              ? 'btn-primary'
                              : lateJoinable
                                ? 'btn-primary'
                                : 'btn-secondary'
                      return (
                        <Link
                          href={href}
                          className={`${styleClass} mt-auto w-full text-sm py-2`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {label}
                        </Link>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}

          {hasMore && !loading && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void loadGames(cursor)}
                disabled={loadingMore}
                className="btn-secondary btn-fit px-6 text-sm py-2"
              >
                {loadingMore ? 'Loading…' : 'Load more games'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-faint text-xs">
          <Link href="/" className="hover:text-body transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </>
  )
}
