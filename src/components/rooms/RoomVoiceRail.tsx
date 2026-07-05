'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants } from '@livekit/components-react'
import { useToast } from '@/components/ui/Toast'
import { RoomVoiceBar, type VoiceParticipant } from '@/components/rooms/RoomVoiceBar'
import type { AudioAuth } from '@/components/AudioChat'

interface RoomVoiceRailProps {
  roomCode: string
  playerName: string
  /** Stable, unique LiveKit identity (defaults to playerName). */
  identity?: string
  auth: AudioAuth
  /** You are the host (Host pill + Leave copy). */
  host?: boolean
  hostBadge?: boolean
  /** Spectator count shown in the rail. */
  watching?: number
  /** Hide "Leave game" (chess/checkers use Resign). */
  resignOnly?: boolean
  onLeave?: () => void
}

/**
 * Design-system voice control — the same LiveKit connect / join / presence /
 * mute logic as `AudioChat`, but rendered through the reusable `RoomVoiceBar`
 * (join-first, presence nudge, live participants). Drop-in replacement for
 * `AudioChat`; sits as a compact floating rail so it doesn't collide with the
 * existing top header.
 */
export function RoomVoiceRail({
  roomCode,
  playerName,
  identity,
  auth,
  host,
  hostBadge,
  watching,
  resignOnly,
  onLeave,
}: RoomVoiceRailProps) {
  const { error: toastError } = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [resolvedRoomCode, setResolvedRoomCode] = useState(roomCode)
  const [presenceCount, setPresenceCount] = useState(0)

  const [myTabId] = useState(() => Math.random().toString(36).substring(2))
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
  const joinAudioRef = useRef<() => Promise<void>>(null)
  const authRef = useRef(auth)
  authRef.current = auth

  // Resolve the parent room code if this game belongs to a persistent room.
  useEffect(() => {
    let active = true
    setResolvedRoomCode(roomCode)
    fetch(`/api/games/${encodeURIComponent(roomCode.toUpperCase())}/room`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.roomCode) setResolvedRoomCode(data.roomCode)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [roomCode])

  // Poll how many people are already in voice (a join nudge) until we join.
  useEffect(() => {
    if (token || !resolvedRoomCode) {
      setPresenceCount(0)
      return
    }
    let active = true
    const poll = async () => {
      try {
        const res = await fetch('/api/audio-presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: resolvedRoomCode.toUpperCase(),
            identity: identity || playerName,
            auth: authRef.current,
          }),
        })
        const data = res.ok ? await res.json() : null
        if (active) setPresenceCount(typeof data?.count === 'number' ? data.count : 0)
      } catch {
        if (active) setPresenceCount(0)
      }
    }
    poll()
    const interval = window.setInterval(poll, 12000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [token, resolvedRoomCode, identity, playerName])

  const joinAudio = async () => {
    if (!resolvedRoomCode || !playerName) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/audio-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: resolvedRoomCode.toUpperCase(),
          identity: identity || playerName,
          name: playerName,
          auth,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to fetch audio token')
      }
      const data = await res.json()
      setToken(data.token)
      localStorage.setItem(
        `fateround_voice_${resolvedRoomCode.toUpperCase()}`,
        JSON.stringify({ active: true, timestamp: Date.now() })
      )
      const bc = new BroadcastChannel('fateround-audio-chat')
      bc.postMessage({ type: 'claim_voice', roomCode: resolvedRoomCode.toUpperCase(), tabId: myTabId })
      bc.close()
      setActiveTabId(myTabId)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join voice chat')
    } finally {
      setIsConnecting(false)
    }
  }
  joinAudioRef.current = joinAudio

  const leaveAudio = (manual = true) => {
    setToken(null)
    if (manual) {
      localStorage.removeItem(`fateround_voice_${resolvedRoomCode.toUpperCase()}`)
      const bc = new BroadcastChannel('fateround-audio-chat')
      bc.postMessage({ type: 'voice_disconnected', roomCode: resolvedRoomCode.toUpperCase(), tabId: myTabId })
      bc.close()
      setActiveTabId(null)
    }
  }

  // Cross-tab: only one tab holds the live call.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const codeUpper = resolvedRoomCode.toUpperCase()
    const bc = new BroadcastChannel('fateround-audio-chat')
    const handle = (e: MessageEvent) => {
      const msg = e.data
      if (!msg || msg.roomCode !== codeUpper) return
      if (msg.type === 'claim_voice' && msg.tabId !== myTabId) {
        if (token) leaveAudio(false)
        setActiveTabId(msg.tabId)
      } else if (msg.type === 'voice_query' && token) {
        bc.postMessage({ type: 'voice_active', roomCode: codeUpper, tabId: myTabId, activeTabId: myTabId })
      } else if (msg.type === 'voice_active') {
        setActiveTabId(msg.activeTabId)
      } else if (msg.type === 'voice_disconnected' && msg.tabId === activeTabId) {
        setActiveTabId(null)
      }
    }
    bc.addEventListener('message', handle)
    bc.postMessage({ type: 'voice_query', roomCode: codeUpper, tabId: myTabId })
    return () => {
      bc.removeEventListener('message', handle)
      bc.close()
    }
  }, [resolvedRoomCode, myTabId, token, activeTabId])

  // Auto-reconnect a recent session (within 4h) if no other tab holds it.
  useEffect(() => {
    if (token || isConnecting || activeTabId) return
    const codeUpper = resolvedRoomCode.toUpperCase()
    const timeout = window.setTimeout(() => {
      const stored = localStorage.getItem(`fateround_voice_${codeUpper}`)
      if (!stored) return
      try {
        const parsed = JSON.parse(stored)
        if (parsed.active && Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
          void joinAudioRef.current?.()
        }
      } catch {
        /* ignore */
      }
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [resolvedRoomCode, activeTabId, token, isConnecting])

  if (!serverUrl) return null

  const shell = (children: React.ReactNode) => (
    <div className="fr-portal" style={railWrap}>
      <div style={railPill}>{children}</div>
    </div>
  )

  // Not connected → the join-first bar (presence nudge lives on the mic pill).
  if (!token) {
    return shell(
      <RoomVoiceBar
        bare
        popUp
        code={roomCode.toUpperCase()}
        name={playerName}
        host={host}
        hostBadge={hostBadge}
        watching={watching}
        resignOnly={resignOnly}
        presenceCount={isConnecting ? 0 : presenceCount}
        onJoinVoice={joinAudio}
        onLeave={onLeave}
      />
    )
  }

  // Connected → drive the bar from live LiveKit state.
  return shell(
    <LiveKitRoom
      video={false}
      audio
      token={token}
      serverUrl={serverUrl}
      connect
      onDisconnected={() => leaveAudio(false)}
      style={{ display: 'contents' }}
    >
      <RoomAudioRenderer />
      <ConnectedBar
        code={roomCode.toUpperCase()}
        name={playerName}
        host={host}
        hostBadge={hostBadge}
        watching={watching}
        resignOnly={resignOnly}
        onLeave={() => {
          leaveAudio(true)
          onLeave?.()
        }}
      />
    </LiveKitRoom>
  )
}

function ConnectedBar(props: {
  code: string
  name: string
  host?: boolean
  hostBadge?: boolean
  watching?: number
  resignOnly?: boolean
  onLeave?: () => void
}) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()

  const mapped: VoiceParticipant[] = participants.map((p) => ({
    n: p.name || p.identity,
    host: p.identity?.startsWith('host-'),
    talking: p.isSpeaking,
    muted: !p.isMicrophoneEnabled,
  }))

  return (
    <RoomVoiceBar
      bare
      popUp
      inVoice
      code={props.code}
      name={props.name}
      host={props.host}
      hostBadge={props.hostBadge}
      watching={props.watching}
      resignOnly={props.resignOnly}
      participants={mapped}
      muted={!isMicrophoneEnabled}
      onToggleMute={() => void localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
      onLeave={props.onLeave}
    />
  )
}

const railWrap: React.CSSProperties = {
  position: 'fixed',
  bottom: 'calc(1rem + env(safe-area-inset-bottom))',
  right: '1rem',
  zIndex: 50,
}
const railPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 9999,
  boxShadow: 'var(--shadow-lg)',
  padding: '6px 10px',
}
