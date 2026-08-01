import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGameRoomCode, postAudioPresence, postAudioToken } from '@/lib/voice-api'
import { ensureMicPermission } from '@/lib/mic-permission'
import { getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import type { AudioAuth } from '@/lib/voice-types'
import { useHostVoiceDisplayName, useHostVoiceIdentity } from '@/hooks/useHostVoiceIdentity'
import { useAppActive } from '@/hooks/useAppActive'

export type VoiceMode = 'player' | 'host'

type Options = {
  gameCode: string
  mode: VoiceMode
  hostToken?: string
}

export function useVoiceRoom({ gameCode, mode, hostToken }: Options) {
  const hostIdentity = useHostVoiceIdentity(mode === 'host' ? gameCode : '')
  const hostDisplayName = useHostVoiceDisplayName(mode === 'host' ? gameCode : '')

  const [playerIdentity, setPlayerIdentity] = useState<string | null>(null)
  // The player's secret resume token — voice authorizes on this, never on playerIdentity.
  const [playerResumeToken, setPlayerResumeToken] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [playerReady, setPlayerReady] = useState(false)

  const [resolvedRoomCode, setResolvedRoomCode] = useState(gameCode.toUpperCase())
  const [token, setToken] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  // Silent-reconnect grace window: after an unexpected drop we keep trying to
  // re-establish for RECONNECT_WINDOW_MS before showing the Join button.
  const [reconnecting, setReconnecting] = useState(false)
  const reconnectingRef = useRef(false)
  const reconnectRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [presenceCount, setPresenceCount] = useState(0)
  // The rail now mounts on every game (matching web), so this 12s presence POST
  // runs for every player of every game. Pause it while backgrounded — same M3
  // rule the other network pollers follow; a resume re-runs the effect, which
  // polls once immediately.
  const appActive = useAppActive()
  const [error, setError] = useState<string | null>(null)

  const authRef = useRef<AudioAuth | null>(null)

  useEffect(() => {
    if (mode !== 'player') return
    let active = true
    const sync = async () => {
      const session = await getPlayerSession(gameCode)
      if (!active) return
      if (!session?.playerId) {
        setPlayerReady(false)
        setPlayerIdentity(null)
        setPlayerResumeToken(null)
        setPlayerName('')
        return
      }
      setPlayerIdentity(session.playerId)
      setPlayerResumeToken(session.resumeToken ?? null)
      setPlayerName(session.playerName)
      setPlayerReady(true)
    }
    void sync()
    return subscribePlayerSession(gameCode, () => void sync())
  }, [gameCode, mode])

  const identity = mode === 'host' ? hostIdentity : playerIdentity
  const displayName = mode === 'host' ? hostDisplayName : playerName
  const auth: AudioAuth | null =
    mode === 'host' && hostToken
      ? { kind: 'host', token: hostToken }
      : mode === 'player' && playerResumeToken
        ? { kind: 'player', resumeToken: playerResumeToken }
        : null

  authRef.current = auth

  const ready = mode === 'host' ? !!hostToken && !!hostIdentity : playerReady && !!playerResumeToken

  useEffect(() => {
    let active = true
    setResolvedRoomCode(gameCode.toUpperCase())
    void fetchGameRoomCode(gameCode).then((code) => {
      if (active) setResolvedRoomCode(code)
    })
    return () => {
      active = false
    }
  }, [gameCode])

  useEffect(() => {
    if (token || !resolvedRoomCode || !identity || !auth || !appActive) {
      setPresenceCount(0)
      return
    }

    let active = true
    const poll = async () => {
      try {
        const data = await postAudioPresence({
          roomName: resolvedRoomCode,
          auth: authRef.current!,
        })
        if (active) setPresenceCount(typeof data.count === 'number' ? data.count : 0)
      } catch {
        if (active) setPresenceCount(0)
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), 12000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token, resolvedRoomCode, identity, auth, appActive])

  // Fetch a fresh LiveKit token for the current identity. Shared by the
  // user-driven join() and the silent reconnect loop.
  const requestToken = useCallback(async () => {
    if (!identity || !auth || !resolvedRoomCode) throw new Error('voice not ready')
    let name = displayName
    if (mode === 'host') {
      const session = await getPlayerSession(gameCode)
      name = session?.playerName?.trim() || 'Host'
    }
    const data = await postAudioToken({ roomName: resolvedRoomCode, name, auth })
    return data.token
  }, [auth, displayName, gameCode, identity, mode, resolvedRoomCode])

  const clearReconnect = useCallback(() => {
    reconnectingRef.current = false
    setReconnecting(false)
    if (reconnectRetryRef.current) {
      clearTimeout(reconnectRetryRef.current)
      reconnectRetryRef.current = null
    }
    if (reconnectDeadlineRef.current) {
      clearTimeout(reconnectDeadlineRef.current)
      reconnectDeadlineRef.current = null
    }
  }, [])

  const join = useCallback(async () => {
    if (!identity || !auth || !displayName || !resolvedRoomCode) return
    clearReconnect()
    setError(null)
    setIsConnecting(true)
    try {
      const permitted = await ensureMicPermission()
      if (!permitted) {
        setError('Microphone permission is required for voice chat')
        return
      }
      setToken(await requestToken())
    } catch (err) {
      // Log the raw reason for debugging; players get a plain message, never a
      // leaked server/config string.
      console.error('[voice] join failed', err)
      setError('Could not join voice chat. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }, [auth, clearReconnect, displayName, identity, requestToken, resolvedRoomCode])

  const giveUpReconnect = useCallback(() => {
    clearReconnect()
    setToken(null)
    setError('Voice chat disconnected. Tap Join voice to reconnect.')
  }, [clearReconnect])

  // One reconnect attempt: fetch a fresh token and remount the room. Success is
  // detected by the room firing onConnected (→ reconnected()); a fresh failure
  // re-enters via beginReconnect(). Only schedule the next try when the fetch
  // itself fails, so we don't hammer the token endpoint.
  const attemptReconnect = useCallback(async () => {
    if (!reconnectingRef.current) return
    try {
      const t = await requestToken()
      if (reconnectingRef.current) setToken(t)
    } catch {
      if (!reconnectingRef.current) return
      reconnectRetryRef.current = setTimeout(() => void attemptReconnect(), 2000)
    }
  }, [requestToken])

  const beginReconnect = useCallback(() => {
    if (!identity || !auth) {
      giveUpReconnect()
      return
    }
    setToken(null) // drop the dead room before re-fetching
    if (reconnectingRef.current) {
      // The remounted room dropped again — retry shortly, still inside the window.
      if (reconnectRetryRef.current) clearTimeout(reconnectRetryRef.current)
      reconnectRetryRef.current = setTimeout(() => void attemptReconnect(), 2000)
      return
    }
    reconnectingRef.current = true
    setReconnecting(true)
    // Hard stop: give up if we haven't reconnected within the window (covers a
    // room that hangs mid-connect without firing onConnected/onDisconnected).
    reconnectDeadlineRef.current = setTimeout(giveUpReconnect, 8000)
    void attemptReconnect()
  }, [attemptReconnect, auth, giveUpReconnect, identity])

  const reconnected = useCallback(() => {
    if (reconnectingRef.current) clearReconnect()
  }, [clearReconnect])

  const leave = useCallback(() => {
    clearReconnect()
    setToken(null)
  }, [clearReconnect])

  useEffect(() => () => clearReconnect(), [clearReconnect])

  return {
    ready,
    identity,
    displayName,
    auth,
    token,
    isConnecting,
    reconnecting,
    presenceCount,
    error,
    join,
    leave,
    beginReconnect,
    reconnected,
    inVoice: !!token,
    isHost: mode === 'host',
  }
}
