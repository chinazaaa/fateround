'use client'

import { useState, useEffect, useRef } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants } from '@livekit/components-react'
import type { DisconnectReason } from 'livekit-client'
import { voiceDisconnectMessage } from '@/lib/voice-errors'
import { useToast } from '@/components/ui/Toast'

/** Proof the caller is allowed in the room, verified server-side before a token is minted.
 *
 * Every variant carries a SECRET the client already holds — the player's resume token, the
 * room member's code, or the game's host token. It used to carry only the player/member id,
 * but those are public (the roster has to render), so anyone could mint a token for any room;
 * see the note in `src/lib/audio-room-auth.ts`. The LiveKit identity is now derived
 * server-side from whichever row the secret resolves to, so it is no longer a prop. */
export type AudioAuth =
  | { kind: 'player'; resumeToken: string }
  | { kind: 'member'; memberCode: string }
  | { kind: 'host'; token: string }

interface AudioChatProps {
  roomCode: string
  playerName: string
  auth: AudioAuth
  /** Auto-join voice on mount (from profile `default_voice_on` preference). */
  autoJoin?: boolean
}

export function AudioChat({ roomCode, playerName, auth, autoJoin = false }: AudioChatProps) {
  const { error: toastError } = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dynamic Room Resolution: Resolve parent room code if game belongs to a room
  const [resolvedRoomCode, setResolvedRoomCode] = useState<string>(roomCode)

  // Cross-tab Synchronization States
  const [myTabId] = useState(() => Math.random().toString(36).substring(2))
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // How many people are already in the voice chat (shown as a badge to nudge
  // others to join). Only polled while this tab hasn't joined.
  const [presenceCount, setPresenceCount] = useState(0)

  // Which side the floating control parks on, so it can be moved out of the way
  // of wide game boards (e.g. Scrabble). Persisted per device.
  const [side, setSide] = useState<'left' | 'right'>('right')
  useEffect(() => {
    const saved = localStorage.getItem('fateround_voice_side')
    if (saved === 'left' || saved === 'right') setSide(saved)
  }, [])
  const flipSide = () =>
    setSide((prev) => {
      const next = prev === 'right' ? 'left' : 'right'
      try {
        localStorage.setItem('fateround_voice_side', next)
      } catch {
        // ignore storage failures
      }
      return next
    })

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
  const joinAudioRef = useRef<() => Promise<void>>(null)
  // True from the moment WE tear the room down (Leave, or another tab taking the
  // call over) until the next join. LiveKit's own `shouldConnect` guard — which
  // exists to swallow the connect-promise rejection that an intentional
  // disconnect raises — only clears when the `connect` prop flips to false. We
  // tear down by unmounting <LiveKitRoom> (token → null) instead, so that guard
  // never clears and our own Leave arrives at `onError` looking exactly like a
  // failed connect. Track the intent ourselves so Leave stays silent.
  const leavingRef = useRef(false)
  const userDeclinedRef = useRef(false)
  // Keep auth in a ref so the presence poll doesn't restart when the parent
  // passes a fresh auth object on every render.
  const authRef = useRef(auth)
  authRef.current = auth

  // 1. Resolve room code dynamically if this is a game linked to a persistent room
  useEffect(() => {
    let active = true

    const fallbackRoomCode = roomCode
    setResolvedRoomCode(fallbackRoomCode)

    async function resolveRoom() {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(fallbackRoomCode.toUpperCase())}/room`)
        if (!active) return

        if (res.ok) {
          const data = await res.json()
          if (data.roomCode) {
            setResolvedRoomCode(data.roomCode)
          }
        }
      } catch (err) {
        if (active) setResolvedRoomCode(fallbackRoomCode)
      }
    }
    resolveRoom()
    return () => {
      active = false
    }
  }, [roomCode])

  // 1b. Poll how many people are in the voice chat while we haven't joined, so
  // we can badge the icon and prompt people to hop in. Once joined, the panel
  // shows the live participant list instead.
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
            auth: authRef.current,
          }),
        })
        if (!res.ok) {
          if (active) setPresenceCount(0)
          return
        }
        const data = await res.json()
        if (active) setPresenceCount(typeof data.count === 'number' ? data.count : 0)
      } catch {
        // Best-effort hint — clear the badge so a stale count from a previous
        // room/auth doesn't linger after a failure.
        if (active) setPresenceCount(0)
      }
    }

    poll()
    const interval = window.setInterval(poll, 12000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [token, resolvedRoomCode, playerName])

  // 2. Join voice chat handler
  const joinAudio = async () => {
    if (!resolvedRoomCode || !playerName) return
    setIsConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/audio-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: resolvedRoomCode.toUpperCase(),
          name: playerName,
          auth,
        }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to fetch audio token')
      }
      const data = await res.json()
      leavingRef.current = false
      setToken(data.token)
      setIsOpen(true)

      // Persist call state in local storage (valid for 4 hours)
      localStorage.setItem(
        `fateround_voice_${resolvedRoomCode.toUpperCase()}`,
        JSON.stringify({ active: true, timestamp: Date.now() })
      )

      // Broadcast claim to other tabs
      const bc = new BroadcastChannel('fateround-audio-chat')
      bc.postMessage({ type: 'claim_voice', roomCode: resolvedRoomCode.toUpperCase(), tabId: myTabId })
      bc.close()

      setActiveTabId(myTabId)
    } catch (err) {
      // Log the raw reason (server error / network) for debugging; players get a
      // plain message, never a leaked config string like "LIVEKIT_API_KEY not set".
      console.error('[voice] join failed', err)
      toastError('Could not join voice chat. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }
  joinAudioRef.current = joinAudio

  // LiveKit fires onDisconnected on any terminal disconnect — an early/failed
  // media negotiation (common on phones), a same-identity takeover, or a network
  // drop. Clearing the token then silently flips back to the "Join voice" button,
  // which reads as an instant self-kick right after clicking Join. Tear the dead
  // room down (correct) but make the reason visible so it's clearly a disconnect,
  // not an untoggle — except CLIENT_INITIATED, which is just our own Leave.
  const handleDisconnected = (reason?: DisconnectReason) => {
    leaveAudio(false)
    const message = voiceDisconnectMessage(reason)
    if (message) toastError(message)
  }

  // 3. Leave voice chat handler
  const leaveAudio = (manual = true) => {
    leavingRef.current = true
    if (manual) userDeclinedRef.current = true
    setToken(null)
    setIsOpen(false)
    if (manual) {
      localStorage.removeItem(`fateround_voice_${resolvedRoomCode.toUpperCase()}`)
      const bc = new BroadcastChannel('fateround-audio-chat')
      bc.postMessage({ type: 'voice_disconnected', roomCode: resolvedRoomCode.toUpperCase(), tabId: myTabId })
      bc.close()
      setActiveTabId(null)
    }
  }

  // 4. Cross-tab communication listener (BroadcastChannel)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const resolvedCodeUpper = resolvedRoomCode.toUpperCase()
    const bc = new BroadcastChannel('fateround-audio-chat')

    const handleMessage = (e: MessageEvent) => {
      const msg = e.data
      if (!msg || msg.roomCode !== resolvedCodeUpper) return

      if (msg.type === 'claim_voice' && msg.tabId !== myTabId) {
        // Disconnect if another tab claimed voice chat
        if (token) {
          leaveAudio(false)
        }
        setActiveTabId(msg.tabId)
      } else if (msg.type === 'voice_query') {
        if (token) {
          bc.postMessage({
            type: 'voice_active',
            roomCode: resolvedCodeUpper,
            tabId: myTabId,
            activeTabId: myTabId,
          })
        }
      } else if (msg.type === 'voice_active') {
        setActiveTabId(msg.activeTabId)
      } else if (msg.type === 'voice_disconnected' && msg.tabId === activeTabId) {
        setActiveTabId(null)
      }
    }

    bc.addEventListener('message', handleMessage)
    bc.postMessage({ type: 'voice_query', roomCode: resolvedCodeUpper, tabId: myTabId })

    return () => {
      bc.removeEventListener('message', handleMessage)
      bc.close()
    }
  }, [resolvedRoomCode, myTabId, token, activeTabId])

  // 5. Auto-reconnect persistence loop
  useEffect(() => {
    if (token || isConnecting || activeTabId) return
    const resolvedCodeUpper = resolvedRoomCode.toUpperCase()

    const timeout = window.setTimeout(() => {
      const stored = localStorage.getItem(`fateround_voice_${resolvedCodeUpper}`)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // Auto-reconnect if session was active within 4 hours and no tab claimed it.
          if (parsed.active && Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
            void joinAudioRef.current?.()
          }
        } catch (err) {
          // ignore
        }
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [resolvedRoomCode, activeTabId, token, isConnecting])

  // 6. Auto-join on mount when the profile preference is on and there's no
  //    existing session to reconnect to. Runs after the auto-reconnect check
  //    (300ms) so a stored session takes priority over a fresh auto-join.
  useEffect(() => {
    if (!autoJoin || token || isConnecting || activeTabId || userDeclinedRef.current) return
    const resolvedCodeUpper = resolvedRoomCode.toUpperCase()
    const stored = localStorage.getItem(`fateround_voice_${resolvedCodeUpper}`)
    if (stored) return
    const timeout = window.setTimeout(() => {
      void joinAudioRef.current?.()
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [autoJoin, resolvedRoomCode, activeTabId, token, isConnecting])

  if (!serverUrl) {
    return (
      <div className="fixed bottom-4 right-4 z-50 p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-200 shadow-lg max-w-xs">
        ⚠️ <strong>Audio Chat Error:</strong> NEXT_PUBLIC_LIVEKIT_URL env variable is not set.
      </div>
    )
  }

  const isAnotherTabActive = activeTabId && activeTabId !== myTabId

  return (
    <div
      className={`voice-fab fixed bottom-20 z-50 flex flex-col gap-2 ${
        side === 'right' ? 'right-4 items-end' : 'left-4 items-start'
      }`}
    >
      {/* Move the control to the other side (e.g. to clear a wide game board).
       * Labelled so it's obvious it repositions the voice button. */}
      <button
        type="button"
        onClick={flipSide}
        title={`Move voice chat to the ${side === 'right' ? 'left' : 'right'}`}
        aria-label={`Move voice chat control to the ${side === 'right' ? 'left' : 'right'}`}
        className={`flex h-7 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card-strong)] px-2 text-[10px] font-semibold uppercase tracking-wide text-muted shadow hover:text-[var(--foreground)] active:scale-95 transition-all ${
          side === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden
        >
          <path d="M8 7 4 12l4 5" />
          <path d="M16 7l4 5-4 5" />
          <path d="M4 12h16" />
        </svg>
        Move
      </button>
      {/* Floating Join/Leave Button — compact round icon so it stays out of the
       * way during play (matches the connected-state icon below). */}
      {!token ? (
        <div className="relative">
          {/* Soft halo + count badge when others are already in the call. */}
          {presenceCount > 0 && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-emerald-500/40 animate-ping"
              aria-hidden
            />
          )}
          {isAnotherTabActive ? (
            <button
              onClick={joinAudio}
              disabled={isConnecting}
              className="relative flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-body border border-theme text-xl shadow-lg active:scale-95 transition-all duration-150 disabled:opacity-70"
              title={
                isConnecting ? 'Transferring…' : 'Voice chat is running in another tab. Click to switch audio here.'
              }
              aria-label={isConnecting ? 'Transferring voice chat to this tab' : 'Switch voice chat to this tab'}
            >
              {isConnecting ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <span>🔊</span>
              )}
            </button>
          ) : (
            <button
              onClick={joinAudio}
              disabled={isConnecting}
              className="relative flex items-center justify-center w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xl shadow-lg shadow-emerald-950/20 active:scale-95 transition-all duration-150 disabled:opacity-70"
              title={
                isConnecting
                  ? 'Connecting…'
                  : presenceCount > 0
                    ? `Join voice chat — ${presenceCount} already in the call`
                    : 'Join voice chat'
              }
              aria-label={
                isConnecting
                  ? 'Connecting to voice chat'
                  : presenceCount > 0
                    ? `Join voice chat, ${presenceCount} ${presenceCount === 1 ? 'person' : 'people'} already in the call`
                    : 'Join voice chat'
              }
            >
              {isConnecting ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <span>🎙️</span>
              )}
            </button>
          )}
          {presenceCount > 0 && (
            <span
              className={`absolute -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-bold text-white shadow ring-2 ring-[var(--background)] ${
                side === 'right' ? '-right-1' : '-left-1'
              }`}
            >
              {presenceCount}
            </span>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-theme text-body border border-theme shadow-md active:scale-95 transition-all"
            title={isOpen ? 'Minimize voice panel (stays connected)' : 'Open voice panel'}
            aria-label={isOpen ? 'Minimize voice panel (stays connected)' : 'Open voice panel'}
          >
            {isOpen ? '❌' : '🔊'}
          </button>
        </div>
      )}

      {/* Error Message Alert */}
      {error && (
        <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-200 shadow-lg max-w-xs transition-opacity duration-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Voice Chat Control Panel */}
      {token && (
        <LiveKitRoom
          video={false}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          onDisconnected={handleDisconnected}
          onError={(err) => {
            // Our own teardown rejects the in-flight connect — that is not a
            // connection failure, so it must never surface as one. (Also
            // de-dupes: a real failure calls leaveAudio below, so the extra
            // rejections from the stacked catch handlers stay quiet.)
            if (leavingRef.current) return
            // Keep LiveKit's raw reason in the console for debugging, but never
            // show it to players — surface a plain, friendly message instead.
            console.error('[voice] LiveKit connection error', err)
            leaveAudio(false)
            toastError('Could not connect to voice chat. Please try again.')
          }}
          className={isOpen ? 'glass-card-strong w-72 p-4 shadow-xl flex flex-col gap-3 max-h-87.5' : 'hidden'}
        >
          <RoomAudioRenderer />
          {isOpen && (
            <>
              <div className="flex items-center justify-between border-b border-theme pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-body">Voice Chat</h3>
                </div>
                <button
                  onClick={() => leaveAudio(true)}
                  className="text-xs text-red-500 hover:text-red-400 font-semibold px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <AudioChatInner localPlayerName={playerName} />
            </>
          )}
        </LiveKitRoom>
      )}
    </div>
  )
}

interface AudioChatInnerProps {
  localPlayerName: string
}

function isHostIdentity(identity?: string): boolean {
  return !!identity?.startsWith('host-')
}

function HostBadge() {
  return <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded font-semibold">Host</span>
}

function AudioChatInner({ localPlayerName }: AudioChatInnerProps) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const localIsHost = isHostIdentity(localParticipant?.identity)

  const toggleMute = () => {
    if (localParticipant) {
      void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    }
  }

  const isLocalSpeaking = localParticipant?.isSpeaking ?? false

  return (
    <div className="flex flex-col gap-3 flex-1 overflow-hidden">
      {/* All Participant list */}
      <div className="flex-1 overflow-y-auto min-h-30 max-h-50 flex flex-col gap-1.5 pr-1">
        {/* Current Participant */}
        <div className="flex items-center justify-between text-xs p-1.5 rounded bg-surface-inset-bg border border-transparent">
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs">👤</span>
            <span className="font-semibold text-body truncate">{localPlayerName} (You)</span>
            {localIsHost && <HostBadge />}
            {isLocalSpeaking && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded animate-pulse">
                Speaking
              </span>
            )}
          </div>
          <span className="text-xs">{isMicrophoneEnabled ? '🎙️' : '🔇'}</span>
        </div>

        {/* Other Participants */}
        {participants
          .filter((p) => p.identity !== localParticipant?.identity)
          .map((p) => {
            const isSpeaking = p.isSpeaking
            const isMuted = !p.isMicrophoneEnabled
            return (
              <div
                key={p.sid}
                className={`flex items-center justify-between text-xs p-1.5 rounded transition-colors ${
                  isSpeaking
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-transparent border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs">👥</span>
                  <span className="text-body truncate">{p.name || p.identity}</span>
                  {isHostIdentity(p.identity) && <HostBadge />}
                  {isSpeaking && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded animate-pulse">
                      Speaking
                    </span>
                  )}
                </div>
                <span className="text-xs">{isMuted ? '🔇' : '🎙️'}</span>
              </div>
            )
          })}

        {participants.length === 1 && (
          <div className="text-xs text-faint text-center my-4 italic">Waiting for others to join...</div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2 border-t border-theme pt-3 mt-auto">
        <button
          onClick={toggleMute}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white border shadow-sm transition-all active:scale-95 ${
            isMicrophoneEnabled
              ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500'
              : 'bg-red-600 hover:bg-red-500 border-red-500'
          }`}
        >
          <span>{isMicrophoneEnabled ? '🔇' : '🎙️'}</span>
          {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        </button>
      </div>
    </div>
  )
}
