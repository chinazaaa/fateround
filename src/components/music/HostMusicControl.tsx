'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useToast } from '@/components/ui/Toast'
import { useMusicSession } from '@/hooks/useMusicSession'
import { useSpotifySync } from '@/hooks/useSpotifySync'
import type { MusicAuth } from '@/lib/music-auth'
import { startSpotifyConnect } from '@/lib/spotify-connect-client'
import { livePositionMs, type MusicSession, type SpotifyTrackInfo } from '@/lib/music'

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Turn a `music_sessions` row into the field set the control route expects to echo back. */
function sessionFields(s: MusicSession) {
  return {
    track_uri: s.track_uri,
    track_name: s.track_name,
    artist: s.artist,
    album_art: s.album_art,
    duration_ms: s.duration_ms,
  }
}

/**
 * Host DJ panel — a floating, collapsible control that persists across the lobby and active
 * play (mounted once on the host page). The host enables music, searches Spotify, and drives
 * play/pause/seek/track for the whole room. The host also hears the music (via `useSpotifySync`),
 * but controlling does NOT require the host to have Premium — only hearing it does.
 */
export function HostMusicControl({ gameCode, hostToken }: { gameCode: string; hostToken: string | null }) {
  const { error: toastError } = useToast()
  const { session, musicEnabled } = useMusicSession(gameCode)
  // Proof, not an identifier: the server derives `host-<gameCode>` from this after checking
  // the token. Memoised so the hook's effects don't re-run on every render.
  const auth = useMemo<MusicAuth | null>(
    () => (hostToken ? { kind: 'host', gameCode, hostToken } : null),
    [gameCode, hostToken]
  )
  const { connected, product } = useSpotifySync(auth, musicEnabled, session)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrackInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  // Re-render once a second so the progress bar / elapsed time advance while playing.
  const [, setTick] = useState(0)

  const isPremium = product === 'premium'
  // Return to the plain host path — NOT with ?token=. The host token is remembered in
  // localStorage (useHostToken) on this device, so it re-authorizes without carrying the
  // secret through Spotify's redirect chain / browser history.
  const connectSpotify = async () => {
    if (!auth) return
    const message = await startSpotifyConnect(auth, `/host/${gameCode}`)
    if (message) toastError(message)
  }

  // Live progress ticker while playing + panel open.
  useEffect(() => {
    if (!open || !session?.is_playing) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [open, session?.is_playing])

  const control = useCallback(
    async (payload: {
      musicEnabled?: boolean
      session?: (ReturnType<typeof sessionFields> & { is_playing: boolean; position_ms: number }) | null
    }) => {
      if (!hostToken) return
      setBusy(true)
      try {
        const res = await fetch('/api/music/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, hostToken, ...payload }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          toastError(data.error ?? 'Music action failed')
        }
      } catch {
        toastError('Music action failed')
      } finally {
        setBusy(false)
      }
    },
    [gameCode, hostToken, toastError]
  )

  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = query.trim()
      if (!q) return
      if (!hostToken) return
      setSearching(true)
      try {
        const res = await fetch('/api/spotify/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, hostToken, q }),
        })
        const data = (await res.json().catch(() => ({}))) as { tracks?: SpotifyTrackInfo[]; error?: string }
        if (data.error) toastError(data.error)
        setResults(data.tracks ?? [])
      } catch {
        toastError('Spotify search failed')
      } finally {
        setSearching(false)
      }
    },
    [query, gameCode, hostToken, toastError]
  )

  const playTrack = (t: SpotifyTrackInfo) =>
    control({
      session: {
        track_uri: t.uri,
        track_name: t.name,
        artist: t.artist,
        album_art: t.albumArt,
        duration_ms: t.durationMs,
        is_playing: true,
        position_ms: 0,
      },
    })

  const togglePlay = () => {
    if (!session?.track_uri) return
    control({
      session: {
        ...sessionFields(session),
        is_playing: !session.is_playing,
        position_ms: Math.round(livePositionMs(session)),
      },
    })
  }

  const seekTo = (ratio: number) => {
    if (busy || !session?.track_uri || !session.duration_ms) return
    control({
      session: {
        ...sessionFields(session),
        is_playing: session.is_playing,
        position_ms: Math.round(ratio * session.duration_ms),
      },
    })
  }

  const stop = () => control({ session: null })

  // Recomputed every render; the 1s ticker above keeps it advancing while playing.
  const livePos = session ? livePositionMs(session) : 0
  const progress = session?.duration_ms ? Math.min(1, livePos / session.duration_ms) : 0

  if (!hostToken) return null

  return (
    <div className="fixed bottom-3 right-3 z-40 w-[19rem] max-w-[calc(100vw-1.5rem)]">
      <div className="glass-card-strong overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-body">
            <span aria-hidden>🎵</span> Music
            {musicEnabled && session?.is_playing ? (
              <span className="text-xs text-[var(--primary)]">• playing</span>
            ) : null}
          </span>
          <span className="text-muted text-xs">{open ? '▾' : '▸'}</span>
        </button>

        {open ? (
          <div className="space-y-3 border-t border-white/10 px-4 py-3">
            {/* Enable toggle */}
            <label className="flex items-center justify-between text-sm text-body">
              <span>Enable Spotify music</span>
              <input
                type="checkbox"
                checked={musicEnabled}
                disabled={busy}
                onChange={(e) => control({ musicEnabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>

            {musicEnabled ? (
              <>
                {/* Host connection state */}
                {!connected ? (
                  <button
                    type="button"
                    onClick={connectSpotify}
                    className="btn-primary btn-fit block w-full text-center text-xs"
                  >
                    Connect your Spotify
                  </button>
                ) : !isPremium ? (
                  <p className="text-xs text-muted">
                    You can DJ, but hearing music yourself needs Spotify Premium. Players hear it on their own accounts.
                  </p>
                ) : null}

                {/* Now playing */}
                {session?.track_uri ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {session.album_art ? (
                        <Image
                          src={session.album_art}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="h-9 w-9 flex-shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-body">{session.track_name}</p>
                        <p className="truncate text-xs text-muted">{session.artist}</p>
                      </div>
                    </div>
                    {/* Seek bar */}
                    <button
                      type="button"
                      className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/15"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        seekTo((e.clientX - rect.left) / rect.width)
                      }}
                      aria-label="Seek"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-[var(--primary)]"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </button>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted tabular-nums">{fmt(livePos)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={togglePlay}
                          disabled={busy}
                          className="btn-secondary btn-fit text-xs"
                        >
                          {session.is_playing ? '⏸ Pause' : '▶ Play'}
                        </button>
                        <button type="button" onClick={stop} disabled={busy} className="btn-secondary btn-fit text-xs">
                          ⏹ Stop
                        </button>
                      </div>
                      <span className="text-[10px] text-muted tabular-nums">
                        {session.duration_ms ? fmt(session.duration_ms) : '--:--'}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Search */}
                <form onSubmit={runSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a song…"
                    className="input-field flex-1 text-sm"
                  />
                  <button type="submit" disabled={searching} className="btn-primary btn-fit text-xs">
                    {searching ? '…' : 'Find'}
                  </button>
                </form>

                {results.length > 0 ? (
                  <ul className="max-h-52 space-y-1 overflow-y-auto">
                    {results.map((t) => (
                      <li key={t.uri}>
                        <button
                          type="button"
                          onClick={() => playTrack(t)}
                          disabled={busy}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                        >
                          {t.albumArt ? (
                            <Image
                              src={t.albumArt}
                              alt=""
                              width={28}
                              height={28}
                              unoptimized
                              className="h-7 w-7 rounded object-cover"
                            />
                          ) : (
                            <span className="text-sm" aria-hidden>
                              🎵
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-body">{t.name}</span>
                            <span className="block truncate text-[10px] text-muted">{t.artist}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted">
                Turn on music to play a shared Spotify soundtrack for everyone in the room.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
