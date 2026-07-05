'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants } from '@livekit/components-react'
import { useToast } from '@/components/ui/Toast'
import { RoomVoiceBar, type VoiceParticipant } from '@/components/rooms/RoomVoiceBar'
import type { AudioAuth } from '@/components/AudioChat'

interface RoomVoiceRailProps {
  roomCode: string
  /** Game name shown beside the room code in the top bar (e.g. "Smash Marry Kill"). */
  label?: string
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
  /**
   * Auto-reconnect a recent voice session on mount (default true). Set false
   * for a join-first room where voice should never connect until the player
   * taps "Join voice chat" (matches the card-table spectator behaviour).
   */
  autoRejoin?: boolean
  /**
   * `floating` (default) — the compact pill parked bottom-right.
   * `topbar` — the full design-system `.pr-rail` voice bar rendered inline as
   * the top chrome of a `.fr-room` shell (room code · watching · players · mic).
   */
  variant?: 'floating' | 'topbar'
  /**
   * Reports the live voice roster (LiveKit identities + talking/muted state) as
   * it changes, and `[]` when not connected. Lets a sibling (e.g. the desktop
   * side rail) show who is actually in the call.
   */
  onVoiceParticipants?: (parts: { id: string; talking: boolean; muted: boolean }[]) => void
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
  label,
  playerName,
  identity,
  auth,
  host,
  hostBadge,
  watching,
  resignOnly,
  onLeave,
  variant = 'floating',
  autoRejoin = true,
  onVoiceParticipants,
}: RoomVoiceRailProps) {
  const { error: toastError } = useToast()
  const topbar = variant === 'topbar'
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
  // Skipped entirely for join-first rooms (`autoRejoin={false}`).
  useEffect(() => {
    if (!autoRejoin || token || isConnecting || activeTabId) return
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
  }, [autoRejoin, resolvedRoomCode, activeTabId, token, isConnecting])

  // While not in the call there is no voice roster — report empty so consumers
  // (the desktop side rail) don't show anyone as "in chat".
  useEffect(() => {
    if (!token) onVoiceParticipants?.([])
  }, [token, onVoiceParticipants])

  if (!serverUrl) return null

  // In `topbar` mode the bar is the inline `.pr-rail` top chrome of a room
  // shell (no fixed portal); otherwise it's the compact floating pill.
  const shell = (children: React.ReactNode) =>
    topbar ? (
      <>{children}</>
    ) : (
      <div className="fr-portal" style={railWrap}>
        <div style={railPill}>{children}</div>
      </div>
    )

  // Not connected → the join-first bar (presence nudge lives on the mic pill).
  if (!token) {
    return shell(
      <RoomVoiceBar
        bare={!topbar}
        popUp={!topbar}
        code={roomCode.toUpperCase()}
        label={topbar ? label : undefined}
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
        topbar={topbar}
        code={roomCode.toUpperCase()}
        label={topbar ? label : undefined}
        name={playerName}
        host={host}
        hostBadge={hostBadge}
        watching={watching}
        resignOnly={resignOnly}
        onVoiceParticipants={onVoiceParticipants}
        onLeaveVoice={() => leaveAudio(true)}
        onLeave={() => {
          leaveAudio(true)
          onLeave?.()
        }}
      />
    </LiveKitRoom>
  )
}

function ConnectedBar(props: {
  topbar?: boolean
  code: string
  label?: string
  name: string
  host?: boolean
  hostBadge?: boolean
  watching?: number
  resignOnly?: boolean
  onLeaveVoice?: () => void
  onLeave?: () => void
  onVoiceParticipants?: (parts: { id: string; talking: boolean; muted: boolean }[]) => void
}) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()

  const mapped: VoiceParticipant[] = participants.map((p) => ({
    n: p.name || p.identity,
    host: p.identity?.startsWith('host-'),
    talking: p.isSpeaking,
    muted: !p.isMicrophoneEnabled,
  }))

  // Report the live roster upward (keyed on a stable signature so we only fire
  // when identities / talking / muted actually change).
  const report = props.onVoiceParticipants
  const rosterKey = participants
    .map((p) => `${p.identity}:${p.isSpeaking ? 1 : 0}:${p.isMicrophoneEnabled ? 1 : 0}`)
    .join(',')
  useEffect(() => {
    report?.(
      participants.map((p) => ({ id: p.identity, talking: p.isSpeaking, muted: !p.isMicrophoneEnabled }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, rosterKey])

  return (
    <RoomVoiceBar
      bare={!props.topbar}
      popUp={!props.topbar}
      inVoice
      code={props.code}
      label={props.label}
      name={props.name}
      host={props.host}
      hostBadge={props.hostBadge}
      watching={props.watching}
      resignOnly={props.resignOnly}
      participants={mapped}
      muted={!isMicrophoneEnabled}
      onToggleMute={() => void localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
      onLeaveVoice={props.onLeaveVoice}
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
