'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ---- Minimal Web Playback SDK typings (only what we use) -------------------
type SpotifyWebPlaybackState = {
  position: number
  paused: boolean
  track_window: { current_track: { uri: string } | null }
} | null
type SpotifyPlayerInstance = {
  connect: () => Promise<boolean>
  disconnect: () => void
  pause: () => Promise<void>
  seek: (ms: number) => Promise<void>
  setVolume: (v: number) => Promise<void>
  getCurrentState: () => Promise<SpotifyWebPlaybackState>
  /** Unlock the SDK's <audio> element. MUST be called from a user gesture or mobile
   *  browsers keep playback silent even though the device is the active one. */
  activateElement?: () => Promise<void>
  addListener: (event: string, cb: (payload: { device_id?: string; message?: string }) => void) => void
  removeListener: (event: string) => void
}

/** A snapshot of what THIS device is actually doing, for drift correction. */
export type LocalPlayback = { positionMs: number; paused: boolean; uri: string | null }
type SpotifyPlayerCtorOptions = {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}
declare global {
  interface Window {
    Spotify?: { Player: new (opts: SpotifyPlayerCtorOptions) => SpotifyPlayerInstance }
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const API_BASE = 'https://api.spotify.com/v1'

let sdkPromise: Promise<void> | null = null
/** Load the Web Playback SDK once per page; resolve when `onSpotifyWebPlaybackSDKReady` fires. */
function loadSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.Spotify) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
    if (existing) return
    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'))
    document.body.appendChild(script)
  })
  return sdkPromise
}

export type SpotifyPlayerState = {
  /** Web Playback SDK device id, once connected. */
  deviceId: string | null
  isReady: boolean
  /** 'premium' | 'free' | 'open' | null — only 'premium' can actually stream. */
  product: string | null
  /** True once we've confirmed the identity has connected Spotify. */
  connected: boolean
  error: string | null
}

/**
 * Load + connect the Spotify Web Playback SDK for a listener, and expose imperative
 * play/pause/seek helpers that target this player's device. Playback happens on the
 * listener's OWN Spotify account (Premium required) — this is what makes room-wide
 * "sync" possible: every player runs their own device and we steer them all to the
 * host's track + position.
 *
 * @param identity  caller's secret id (player UUID / `host-*`) — the token route key
 * @param enabled   gate the whole thing (feature off, or no identity yet)
 */
export function useSpotifyPlayer(identity: string | null, enabled: boolean) {
  const [state, setState] = useState<SpotifyPlayerState>({
    deviceId: null,
    isReady: false,
    product: null,
    connected: false,
    error: null,
  })
  const playerRef = useRef<SpotifyPlayerInstance | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  // Latest access token, refreshed lazily; used for Web API calls (play with a specific uri).
  const tokenRef = useRef<string | null>(null)

  /** Fetch a fresh access token from our server route (which refreshes server-side). */
  const fetchToken = useCallback(async (): Promise<string | null> => {
    if (!identity) return null
    try {
      const res = await fetch('/api/spotify/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity }),
      })
      if (res.status === 404) {
        setState((s) => (s.connected ? { ...s, connected: false } : s))
        return null
      }
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken: string; product: string | null }
      tokenRef.current = data.accessToken
      setState((s) => ({ ...s, connected: true, product: data.product ?? s.product }))
      return data.accessToken
    } catch {
      return null
    }
  }, [identity])

  useEffect(() => {
    if (!enabled || !identity) return
    let cancelled = false
    // Removes the first-gesture audio-unlock listeners; set once the player exists.
    let removeGestureUnlock: (() => void) | null = null

    // Probe connection + product up front so the UI can show "Connect" vs "Premium required"
    // without waiting for the (heavier) SDK to boot.
    setTimeout(() => {
      void fetchToken().then((token) => {
        if (cancelled || !token) return
        loadSdk()
          .then(() => {
            if (cancelled || !window.Spotify) return
            const player = new window.Spotify.Player({
              name: 'FateRound',
              volume: 0.5,
              getOAuthToken: (cb) => {
                // The SDK asks for a token on connect and whenever it needs to refresh.
                void fetchToken().then((t) => cb(t ?? ''))
              },
            })
            playerRef.current = player
            player.addListener('ready', ({ device_id }) => {
              if (cancelled || !device_id) return
              deviceIdRef.current = device_id
              setState((s) => ({ ...s, deviceId: device_id, isReady: true, error: null }))
            })
            player.addListener('not_ready', () => {
              if (cancelled) return
              setState((s) => ({ ...s, isReady: false }))
            })
            const onErr = ({ message }: { message?: string }) => {
              if (cancelled) return
              setState((s) => ({ ...s, error: message ?? 'Spotify player error' }))
            }
            player.addListener('initialization_error', onErr)
            player.addListener('authentication_error', onErr)
            player.addListener('account_error', onErr)
            player.addListener('playback_error', onErr)
            void player.connect()

            // Playback is started reactively by useSpotifySync, never from a click — so the
            // SDK's <audio> element is never unlocked by a user gesture, and browsers (mobile
            // especially) keep it silent even though this is the active device. Unlock it on
            // the first tap/keypress anywhere; once is enough for the page's lifetime.
            const unlock = () => {
              void player.activateElement?.().catch(() => {})
              removeGestureUnlock?.()
            }
            removeGestureUnlock = () => {
              window.removeEventListener('pointerdown', unlock)
              window.removeEventListener('keydown', unlock)
              removeGestureUnlock = null
            }
            window.addEventListener('pointerdown', unlock)
            window.addEventListener('keydown', unlock)
          })
          .catch(() => {
            if (!cancelled) setState((s) => ({ ...s, error: 'Failed to load Spotify' }))
          })
      })
    }, 0)

    return () => {
      cancelled = true
      removeGestureUnlock?.()
      playerRef.current?.disconnect()
      playerRef.current = null
      deviceIdRef.current = null
    }
  }, [enabled, identity, fetchToken])

  /** Start (or switch to) a track at a position on THIS device. Uses the Web API because
   *  the SDK can't load a track by URI on its own. */
  const playUri = useCallback(
    async (uri: string, positionMs: number) => {
      const deviceId = deviceIdRef.current
      const token = tokenRef.current ?? (await fetchToken())
      if (!deviceId || !token) return
      // playUri is the actual "start audio" action, so surface failures (expired token,
      // no active device) instead of swallowing them — the bar can show the message.
      const res = await fetch(`${API_BASE}/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
      }).catch(() => null)
      if (!res || !res.ok) {
        setState((s) => ({ ...s, error: 'Could not start playback — reopen Spotify on this device.' }))
      } else {
        setState((s) => (s.error ? { ...s, error: null } : s))
      }
    },
    [fetchToken]
  )

  const pause = useCallback(async () => {
    await playerRef.current?.pause().catch(() => {})
  }, [])

  const seek = useCallback(async (positionMs: number) => {
    await playerRef.current?.seek(Math.max(0, Math.round(positionMs))).catch(() => {})
  }, [])

  const setVolume = useCallback(async (volume: number) => {
    await playerRef.current?.setVolume(Math.min(1, Math.max(0, volume))).catch(() => {})
  }, [])

  const getState = useCallback(async (): Promise<LocalPlayback | null> => {
    const player = playerRef.current
    if (!player) return null
    const s = await player.getCurrentState().catch(() => null)
    if (!s) return null
    return { positionMs: s.position, paused: s.paused, uri: s.track_window?.current_track?.uri ?? null }
  }, [])

  return { ...state, playUri, pause, seek, setVolume, getState }
}
