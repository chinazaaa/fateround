'use client'

import { useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants } from '@livekit/components-react'
import { useToast } from '@/components/ui/Toast'

/** Proof the caller is allowed in the room, verified server-side before a
 * token is minted. `player`/`member` are authorized by their secret `identity`
 * (a server-generated UUID); `host` proves itself with the game's host token. */
export type AudioAuth = { kind: 'player' } | { kind: 'member' } | { kind: 'host'; token: string }

interface AudioChatProps {
  roomCode: string
  playerName: string
  /** Stable, unique LiveKit identity. Defaults to playerName, but pass a
   * distinct value (e.g. a member/player id) to avoid identity collisions
   * when display names are not unique. */
  identity?: string
  auth: AudioAuth
}

export function AudioChat({ roomCode, playerName, identity, auth }: AudioChatProps) {
  const { error: toastError } = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

  const joinAudio = async () => {
    if (!roomCode || !playerName) return
    setIsConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/audio-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomCode.toUpperCase(),
          identity: identity || playerName,
          name: playerName,
          auth,
        }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to fetch audio token')
      }
      const data = await res.json()
      setToken(data.token)
      setIsOpen(true)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join voice chat')
    } finally {
      setIsConnecting(false)
    }
  }

  const leaveAudio = () => {
    setToken(null)
    setIsOpen(false)
  }

  if (!serverUrl) {
    return (
      <div className="fixed bottom-4 right-4 z-50 p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-200 shadow-lg max-w-xs">
        ⚠️ <strong>Audio Chat Error:</strong> NEXT_PUBLIC_LIVEKIT_URL env variable is not set.
      </div>
    )
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
      {/* Floating Join/Leave Button — offset up so it clears the feedback button */}
      {!token ? (
        <button
          onClick={joinAudio}
          disabled={isConnecting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950/20 active:scale-95 transition-all duration-150"
        >
          <span>🎙️</span>
          {isConnecting ? 'Connecting...' : 'Join Voice'}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-theme text-body border border-theme shadow-md active:scale-95 transition-all"
            title="Toggle Voice Panel"
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
      {token && isOpen && (
        <div className="glass-card-strong w-72 p-4 shadow-xl flex flex-col gap-3 max-h-87.5">
          <div className="flex items-center justify-between border-b border-theme pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-body">Voice Chat</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={leaveAudio}
                className="text-xs text-red-500 hover:text-red-400 font-semibold px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize"
                aria-label="Minimize voice panel"
                className="flex items-center justify-center w-6 h-6 rounded text-faint hover:text-body hover:bg-surface-inset-bg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          <LiveKitRoom
            video={false}
            audio={true}
            token={token}
            serverUrl={serverUrl}
            connect={true}
            onDisconnected={leaveAudio}
            className="flex flex-col gap-3 flex-1"
          >
            <RoomAudioRenderer />
            <AudioChatInner localPlayerName={playerName} />
          </LiveKitRoom>
        </div>
      )}
    </div>
  )
}

interface AudioChatInnerProps {
  localPlayerName: string
}

function AudioChatInner({ localPlayerName }: AudioChatInnerProps) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()

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
