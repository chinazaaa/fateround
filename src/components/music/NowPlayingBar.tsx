'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMusicSession } from '@/hooks/useMusicSession'
import { useSpotifySync } from '@/hooks/useSpotifySync'

/**
 * Player-side "now playing" bar. Shows the host's current track and keeps this player's
 * Spotify locked to it (via `useSpotifySync`). Renders only when the host has enabled
 * music. Free / unconnected players see a prompt but the game is never blocked.
 */
export function NowPlayingBar({ gameCode, identity }: { gameCode: string; identity: string }) {
  const { session, musicEnabled } = useMusicSession(gameCode)
  const { connected, product, isReady, error, setVolume } = useSpotifySync(identity, musicEnabled, session)
  const [volume, setVolumeState] = useState(0.5)
  const [muted, setMuted] = useState(false)

  if (!musicEnabled) return null

  const hasTrack = Boolean(session?.track_uri)
  const isPremium = product === 'premium'
  const loginHref = `/api/spotify/login?identity=${encodeURIComponent(identity)}&returnTo=${encodeURIComponent(`/game/${gameCode}`)}`

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
          <a href={loginHref} className="btn-primary btn-fit whitespace-nowrap text-xs">
            Connect Spotify
          </a>
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
