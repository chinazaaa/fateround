'use client'

import { useState } from 'react'
import { formatRoomTimezone } from '@/lib/room-timezones'

type Props = {
  roomCode: string
  roomName: string
  description?: string | null
  timezone?: string | null
  onJoined: (identity: { memberId: string; memberCode: string; displayName: string }) => void
}

export function RoomJoinGate({ roomCode, roomName, description, timezone, onJoined }: Props) {
  const [mode, setMode] = useState<'new' | 'returning'>('new')
  const [displayName, setDisplayName] = useState('')
  const [memberCode, setMemberCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const body = mode === 'new'
        ? { displayName: displayName.trim() }
        : { memberCode: memberCode.trim().toUpperCase() }

      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to join'); return }

      localStorage.setItem(
        `kmk_room_${roomCode}_member`,
        JSON.stringify({ memberId: data.memberId, memberCode: data.memberCode, displayName: data.displayName })
      )
      onJoined({ memberId: data.memberId, memberCode: data.memberCode, displayName: data.displayName })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = mode === 'new' ? displayName.trim().length > 0 : memberCode.trim().length >= 4

  return (
    <div className="page-wrap flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <p className="label-caps">Joining room</p>
          <h1 className="text-2xl font-black gradient-title">{roomName}</h1>
          <p className="font-mono text-sm text-faint tracking-widest">{roomCode}</p>
          {description && (
            <p className="text-sm text-muted pt-1 leading-relaxed">{description}</p>
          )}
          {timezone && (
            <p className="text-xs text-faint">🕐 Plays in {formatRoomTimezone(timezone)}</p>
          )}
        </div>

        <div className="glass-card-strong p-4 space-y-4">
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => { setMode('new'); setError('') }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'new' ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'}`}
            >
              New member
            </button>
            <button
              type="button"
              onClick={() => { setMode('returning'); setError('') }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'returning' ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'}`}
            >
              Returning
            </button>
          </div>

          {mode === 'new' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="label-caps">Your display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                  placeholder="What should we call you?"
                  maxLength={30}
                  className="input-field"
                  autoFocus
                />
              </div>
              <p className="text-xs text-faint">You'll get a member code to use on other devices.</p>
            </div>
          )}

          {mode === 'returning' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="label-caps">Your member code</label>
                <input
                  value={memberCode}
                  onChange={(e) => setMemberCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                  placeholder="Enter code"
                  maxLength={6}
                  className="input-field text-center text-xl tracking-[0.2em] font-mono font-bold"
                  autoFocus
                />
              </div>
              <p className="text-xs text-faint">Use the 6-character code you received when you first joined.</p>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || loading}
            className="btn-primary"
          >
            {loading ? 'Joining…' : 'Enter Room'}
          </button>
        </div>
      </div>
    </div>
  )
}
