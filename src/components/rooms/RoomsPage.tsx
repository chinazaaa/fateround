'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import {
  formatRoomTimezone,
  getRoomTimezoneOptions,
  getUserTimezone,
  ROOM_DESCRIPTION_MAX,
} from '@/lib/room-timezones'
import type { RoomRow } from '@/lib/room-api'

type PublicRoom = RoomRow & { memberCount: number }

type Tab = 'create' | 'join' | 'browse'

export function RoomsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('create')
  const [roomName, setRoomName] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [description, setDescription] = useState('')
  const [timezone, setTimezone] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timezoneOptions = getRoomTimezoneOptions()

  useEffect(() => {
    const userTz = getUserTimezone()
    if (userTz) setTimezone(userTz)
  }, [])

  useEffect(() => {
    if (tab !== 'browse') return
    setBrowseLoading(true)
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((d) => setPublicRooms(d.rooms ?? []))
      .catch(() => setPublicRooms([]))
      .finally(() => setBrowseLoading(false))
  }, [tab])

  const createRoom = async () => {
    const name = roomName.trim()
    if (!name) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          maxMembers: maxMembers ? Number(maxMembers) : undefined,
          isPublic,
          description: description.trim() || undefined,
          timezone: timezone || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create room'); return }
      if (data.creatorToken) {
        localStorage.setItem(`kmk_room_${data.roomCode}_creator`, data.creatorToken)
      }
      router.push(`/room/${data.roomCode}`)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rooms/${code}`)
      if (res.status === 404) { setError('Room not found. Check the code and try again.'); return }
      if (!res.ok) { setError('Something went wrong.'); return }
      router.push(`/room/${code}`)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setError('')
  }

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
        <Link href="/" className="pointer-events-auto">
          <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
        </Link>
      </header>

      <div className="page-wrap flex flex-col items-center justify-center px-4 pt-16 pb-8">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-1">
            <div className="text-4xl">🏠</div>
            <h1 className="text-2xl font-black tracking-tight gradient-title">Game Rooms</h1>
            <p className="text-muted text-sm">
              A permanent home base for your friend group. Play multiple games, track stats, and chat — no sign-up needed.
            </p>
          </div>

          <div className="glass-card-strong p-4 space-y-4">
            <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
              <button
                type="button"
                onClick={() => switchTab('create')}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold transition-colors ${tab === 'create' ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'}`}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => switchTab('join')}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold transition-colors ${tab === 'join' ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'}`}
              >
                Join
              </button>
              <button
                type="button"
                onClick={() => switchTab('browse')}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold transition-colors ${tab === 'browse' ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'}`}
              >
                Browse
              </button>
            </div>

            {tab === 'create' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="label-caps">Room name</label>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                    placeholder="e.g. The Office Crew"
                    maxLength={50}
                    className="input-field"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="label-caps">Visibility</label>
                  <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsPublic(false)}
                      className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                        !isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                      }`}
                    >
                      🔒 Private
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublic(true)}
                      className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                        isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                      }`}
                    >
                      🌐 Public
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="label-caps">
                    Description <span className="normal-case text-faint font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this room about?"
                    maxLength={ROOM_DESCRIPTION_MAX}
                    rows={2}
                    className="input-field resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="label-caps">
                    Timezone <span className="normal-case text-faint font-normal">(optional)</span>
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="input-field"
                  >
                    <option value="">No timezone</option>
                    {timezoneOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="label-caps">Max members <span className="normal-case text-faint font-normal">(optional)</span></label>
                  <input
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                    placeholder="No limit"
                    maxLength={3}
                    inputMode="numeric"
                    className="input-field"
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={!roomName.trim() || loading}
                  className="btn-primary"
                >
                  {loading ? 'Creating…' : 'Create Room'}
                </button>
              </div>
            )}

            {tab === 'join' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="label-caps">Room code</label>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                    placeholder="Enter code"
                    maxLength={6}
                    className="input-field text-center text-xl tracking-[0.2em] font-mono font-bold"
                    autoFocus
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={joinCode.length < 4 || loading}
                  className="btn-primary"
                >
                  {loading ? 'Looking up…' : 'Enter Room'}
                </button>
              </div>
            )}

            {tab === 'browse' && (
              <div className="space-y-3">
                <p className="text-xs text-faint">
                  Public rooms anyone can join. Private rooms only appear here if the host makes them public.
                </p>
                {browseLoading ? (
                  <p className="text-sm text-muted text-center py-6">Loading public rooms…</p>
                ) : publicRooms.length === 0 ? (
                  <p className="text-sm text-muted text-center py-6">No public rooms right now. Create one and set it to public!</p>
                ) : (
                  <ul className="space-y-2 max-h-80 overflow-y-auto -mx-1 px-1">
                    {publicRooms.map((room) => (
                      <li
                        key={room.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-body truncate">{room.name}</p>
                            <p className="text-xs text-faint font-mono tracking-wider">{room.id}</p>
                          </div>
                          <span className="shrink-0 text-xs text-faint">
                            {room.memberCount} member{room.memberCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {room.description && (
                          <p className="text-xs text-muted line-clamp-2">{room.description}</p>
                        )}
                        {room.timezone && (
                          <p className="text-xs text-faint">🕐 {formatRoomTimezone(room.timezone)}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => router.push(`/room/${room.id}`)}
                          className="btn-secondary w-full text-sm py-2"
                        >
                          Join room
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-faint text-xs">
            <Link href="/" className="hover:text-body transition-colors">← Back to home</Link>
          </p>
        </div>
      </div>
    </>
  )
}
