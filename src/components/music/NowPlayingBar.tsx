'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useMusicSession } from '@/hooks/useMusicSession'
import { useSpotifySync } from '@/hooks/useSpotifySync'
import type { MusicAuth } from '@/lib/music-auth'
import { startSpotifyConnect } from '@/lib/spotify-connect-client'

/**
 * Player-side "now playing" bar. Shows the host's current track and keeps this player's
 * Spotify locked to it (via `useSpotifySync`). Renders only when the host has enabled
 * music. Free / unconnected players see a prompt but the game is never blocked.
 */
export function NowPlayingBar({ gameCode, resumeToken }: { gameCode: string; resumeToken: string }) {
  const { session, musicEnabled } = useMusicSession(gameCode)
  // The player's resume token is the proof; the server maps it to their player id. Passing a
  // bare player id here was finding C3 — that value is public.
  const auth = useMemo<MusicAuth | null>(
    () => (resumeToken ? { kind: 'player', gameCode, resumeToken } : null),
    [gameCode, resumeToken]
  )
  const { connected, product, isReady, error, setVolume } = useSpotifySync(auth, musicEnabled, session)
  const [volume, setVolumeState] = useState(0.5)
  const [muted, setMuted] = useState(false)
  // Surfaced inline: this bar has no toast, and a silent failure would look like a dead button.
  const [connectError, setConnectError] = useState<string | null>(null)

  if (!musicEnabled) return null

  const hasTrack = Boolean(session?.track_uri)
  const isPremium = product === 'premium'
  const connectSpotify = async () => {
    if (!auth) return
    setConnectError(null)
    setConnectError(await startSpotifyConnect(auth, `/game/${gameCode}`))
  }

  // Nothing to show: connected Premium listener with no track playing yet.
  if (connected && isPremium && !hasTrack) return null

  const changeVolume = (v: number) => {
    setVolumeState(v)
    setMuted(v === 0)
    void setVolume(v)
  }
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    void setVolume(next ? 0 : volume || 0.5)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pointer-events-none">
      <div className="glass-card-strong pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2.5">
        {hasTrack && session?.album_art ? (
          <Image
            src={session.album_art}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="text-xl" aria-hidden>
            🎵
          </span>
        )}

        <div className="min-w-0 flex-1">
          {hasTrack ? (
            <>
              <p className="truncate text-sm font-semibold text-body">{session?.track_name}</p>
              <p className="truncate text-xs text-muted">{session?.artist}</p>
            </>
          ) : (
            <p className="text-sm font-medium text-body">Host is playing music</p>
          )}
        </div>

        {!connected ? (
          <div className="flex flex-col items-end gap-1">
            <button type="button" onClick={connectSpotify} className="btn-primary btn-fit whitespace-nowrap text-xs">
              Connect Spotify
            </button>
            {connectError && <span className="text-xs text-[var(--danger)]">{connectError}</span>}
          </div>
        ) : !isPremium ? (
          <span className="whitespace-nowrap text-xs text-muted">Premium required</span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-lg leading-none"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="w-20 accent-[var(--primary)]"
              aria-label="Music volume"
            />
          </div>
        )}
      </div>

      {error && isReady === false && connected && isPremium ? <span className="sr-only">{error}</span> : null}
    </div>
  )
}
