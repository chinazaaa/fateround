import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGameRoomCode, postAudioPresence, postAudioToken } from '@/lib/voice-api'
import { ensureMicPermission } from '@/lib/mic-permission'
import { getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import type { AudioAuth } from '@/lib/voice-types'
import { useHostVoiceDisplayName, useHostVoiceIdentity } from '@/hooks/useHostVoiceIdentity'

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
  const [playerName, setPlayerName] = useState('')
  const [playerReady, setPlayerReady] = useState(false)

  const [resolvedRoomCode, setResolvedRoomCode] = useState(gameCode.toUpperCase())
  const [token, setToken] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [presenceCount, setPresenceCount] = useState(0)
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
        setPlayerName('')
        return
      }
      setPlayerIdentity(session.playerId)
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
      : mode === 'player' && playerIdentity
        ? { kind: 'player' }
        : null

  authRef.current = auth

  const ready =
    mode === 'host' ? !!hostToken && !!hostIdentity : playerReady && !!playerIdentity

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
    if (token || !resolvedRoomCode || !identity || !auth) {
      setPresenceCount(0)
      return
    }

    let active = true
    const poll = async () => {
      try {
        const data = await postAudioPresence({
          roomName: resolvedRoomCode,
          identity,
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
  }, [token, resolvedRoomCode, identity, auth])

  const join = useCallback(async () => {
    if (!identity || !auth || !displayName || !resolvedRoomCode) return
    setError(null)
    setIsConnecting(true)
    try {
      const permitted = await ensureMicPermission()
      if (!permitted) {
        setError('Microphone permission is required for voice chat')
        return
      }

      let name = displayName
      if (mode === 'host') {
        const session = await getPlayerSession(gameCode)
        name = session?.playerName?.trim() || 'Host'
      }

      const data = await postAudioToken({
        roomName: resolvedRoomCode,
        identity,
        name,
        auth,
      })
      setToken(data.token)
    } catch (err) {
      // Log the raw reason for debugging; players get a plain message, never a
      // leaked server/config string.
      console.error('[voice] join failed', err)
      setError('Could not join voice chat. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }, [auth, displayName, gameCode, identity, mode, resolvedRoomCode])

  const leave = useCallback(() => {
    setToken(null)
  }, [])

  return {
    ready,
    identity,
    displayName,
    auth,
    token,
    isConnecting,
    presenceCount,
    error,
    join,
    leave,
    inVoice: !!token,
    isHost: mode === 'host',
  }
}
