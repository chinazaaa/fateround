'use client'

import { useEffect, useRef } from 'react'
import { usePolling, POLL_INTERVALS } from '@/hooks/usePolling'
import { livePositionMs, type MusicSession } from '@/lib/music'
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer'
import type { MusicAuth } from '@/lib/music-auth'

/** Re-seek when the local device drifts more than this from the host's timeline. */
const DRIFT_THRESHOLD_MS = 1_500

/**
 * Keep a listener's Spotify playback locked to the host's `music_sessions` state.
 *
 * Reconciles on two triggers:
 *  1. State change — a new track, or play/pause flips → act immediately.
 *  2. Drift tick — while playing, compare the device's real position to the extrapolated
 *     host position and re-seek only when off by more than the threshold (so we don't cause
 *     audible jumps every tick).
 *
 * A no-op until the SDK is ready and the account is Premium — free / unconnected players
 * simply hear nothing, and the game is unaffected.
 */
export function useSpotifySync(auth: MusicAuth | null, enabled: boolean, session: MusicSession | null) {
  const player = useSpotifyPlayer(auth, enabled)
  const { isReady, product, playUri, pause, seek, getState } = player

  // What we last drove the device to, so we can detect track / play-state transitions.
  const lastAppliedUriRef = useRef<string | null>(null)
  const lastPlayingRef = useRef<boolean>(false)

  const canPlay = enabled && isReady && product === 'premium'

  // When the device drops (SDK not_ready from a sleep / network blip), clear the
  // "last applied" memory so that on reconnect we re-issue play for the still-current
  // track instead of assuming it's already playing (it isn't — the device was gone).
  useEffect(() => {
    if (!canPlay) {
      lastAppliedUriRef.current = null
      lastPlayingRef.current = false
    }
  }, [canPlay])

  // Immediate reconcile whenever the host's state changes.
  useEffect(() => {
    if (!canPlay) return
    const uri = session?.track_uri ?? null
    const isPlaying = Boolean(session?.is_playing && uri)

    if (!uri || !isPlaying) {
      if (lastPlayingRef.current) void pause()
      lastPlayingRef.current = false
      if (!uri) lastAppliedUriRef.current = null
      return
    }

    const target = livePositionMs(session!)
    if (uri !== lastAppliedUriRef.current || !lastPlayingRef.current) {
      // New track, or resuming from paused — (re)start it at the host's position.
      lastAppliedUriRef.current = uri
      lastPlayingRef.current = true
      void playUri(uri, target)
    }
    // Same track still playing: the drift tick handles fine correction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, session?.track_uri, session?.is_playing, session?.position_ms, session?.updated_at])

  // Slow drift correction while playing.
  usePolling(
    async () => {
      if (!canPlay || !session?.is_playing || !session.track_uri) return
      const local = await getState()
      if (!local || local.paused) return
      // Ignore if the device is on a different track (a fresh play is already in flight).
      if (local.uri && session.track_uri && local.uri !== session.track_uri) return
      const target = livePositionMs(session)
      if (Math.abs(local.positionMs - target) > DRIFT_THRESHOLD_MS) {
        void seek(target)
      }
    },
    [canPlay, session?.track_uri, session?.is_playing, session?.position_ms, session?.updated_at],
    { intervalMs: POLL_INTERVALS.activeGame, enabled: canPlay }
  )

  return player
}
