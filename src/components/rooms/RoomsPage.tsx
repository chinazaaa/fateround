'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock01Icon, LockIcon } from '@hugeicons/core-free-icons'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import { supabase } from '@/lib/supabase'
import { formatRoomTimezone, getRoomTimezoneOptions, getUserTimezone, ROOM_DESCRIPTION_MAX } from '@/lib/room-timezones'
import type { RoomRow } from '@/lib/room-api'
import {
  applyRoomsRealtimeEvent,
  PUBLIC_ROOMS_REALTIME_FILTER,
  type BrowsableRoom as PublicRoom,
} from '@/lib/rooms-realtime'

type Tab = 'create' | 'join' | 'browse'

const TABS: { key: Tab; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'join', label: 'Join' },
  { key: 'browse', label: 'Browse' },
]

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
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false)
  const [browseHasMore, setBrowseHasMore] = useState(false)
  const [browseCursor, setBrowseCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timezoneOptions = getRoomTimezoneOptions()

  useEffect(() => {
    const userTz = getUserTimezone()
    if (userTz) setTimezone(userTz)
  }, [])

  const loadPublicRooms = useCallback(async (cursor?: string | null) => {
    const loadingMore = !!cursor
    if (loadingMore) setBrowseLoadingMore(true)
    else setBrowseLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/rooms?${params}`)
      const d = await res.json()
      const rooms: PublicRoom[] = d.rooms ?? []
      setPublicRooms((prev) => (loadingMore ? [...prev, ...rooms] : rooms))
      setBrowseHasMore(!!d.hasMore)
      setBrowseCursor(d.nextCursor ?? null)
    } catch {
      if (!loadingMore) setPublicRooms([])
      setBrowseHasMore(false)
      setBrowseCursor(null)
    } finally {
      if (loadingMore) setBrowseLoadingMore(false)
      else setBrowseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'browse') return
    void loadPublicRooms()
  }, [tab, loadPublicRooms])

  useEffect(() => {
    if (tab !== 'browse') return

    const onUpsert = (eventType: 'INSERT' | 'UPDATE', room: RoomRow) => {
      setPublicRooms((prev) => {
        const { rooms, reload } = applyRoomsRealtimeEvent(prev, { eventType, room })
        if (reload) void loadPublicRooms()
        return rooms
      })
    }

    const channel = supabase
      .channel('public_rooms_browse')
      // Server-side filter: without it every visitor on this tab received an event for
      // every room change across the entire platform, and `is_public` defaults to false.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rooms', filter: PUBLIC_ROOMS_REALTIME_FILTER },
        (payload) => onUpsert('INSERT', payload.new as RoomRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: PUBLIC_ROOMS_REALTIME_FILTER },
        (payload) => onUpsert('UPDATE', payload.new as RoomRow)
      )
      // DELETE is intentionally UNFILTERED: `rooms` has REPLICA IDENTITY DEFAULT, so a
      // DELETE payload carries only the primary key. Filtering on `is_public` would make
      // these events never match and deleted rooms would linger in the list forever.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms' }, (payload) => {
        const id = (payload.old as { id?: string })?.id
        setPublicRooms((prev) => applyRoomsRealtimeEvent(prev, { eventType: 'DELETE', id }).rooms)
      })
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadPublicRooms()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tab, loadPublicRooms])

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
      if (!res.ok) {
        setError(data.error ?? 'Failed to create room')
        return
      }
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
      if (res.status === 404) {
        setError('Room not found. Check the code and try again.')
        return
      }
      if (!res.ok) {
        setError('Something went wrong.')
        return
      }
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
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-6 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={UI_ICONS.home} size={26} />
            </span>
            <h1
              className="mx-0 mb-2.5 mt-3 text-[2.25rem] tracking-[-0.035em] sm:text-5xl"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)' }}
            >
              Game Rooms
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              A permanent home base for your group. Play multiple games, track stats, and chat.
            </p>
          </div>

          <div className="fr-card fr-card--xl space-y-4 mx-auto max-w-[33rem]">
            <div className="fr-segment" role="tablist" aria-label="Room actions">
              {TABS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.key}
                  onClick={() => switchTab(entry.key)}
                  className="fr-segment__btn"
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {tab === 'create' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="room-name" className="label-caps">
                    Room name
                  </label>
                  <input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                    placeholder="e.g. The Office Crew"
                    maxLength={50}
                    className="fr-input"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="label-caps">Visibility</p>
                  {/* `aria-pressed` rather than `aria-selected`: these are two
                      toggle buttons, not tabs — nothing below them swaps. */}
                  <div className="fr-segment">
                    <button
                      type="button"
                      aria-pressed={!isPublic}
                      onClick={() => setIsPublic(false)}
                      className="fr-segment__btn"
                    >
                      <Glyph icon={LockIcon} size={15} />
                      Private
                    </button>
                    <button
                      type="button"
                      aria-pressed={isPublic}
                      onClick={() => setIsPublic(true)}
                      className="fr-segment__btn"
                    >
                      <Glyph icon={UI_ICONS.browse} size={15} />
                      Public
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="room-description" className="label-caps">
                    Description <span className="font-normal normal-case text-faint">(optional)</span>
                  </label>
                  <textarea
                    id="room-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this room about?"
                    maxLength={ROOM_DESCRIPTION_MAX}
                    rows={2}
                    className="fr-input resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="room-timezone" className="label-caps">
                    Timezone <span className="font-normal normal-case text-faint">(optional)</span>
                  </label>
                  <select
                    id="room-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="fr-select"
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
                  <label htmlFor="room-max-members" className="label-caps">
                    Max members <span className="font-normal normal-case text-faint">(optional)</span>
                  </label>
                  <input
                    id="room-max-members"
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                    placeholder="No limit"
                    maxLength={3}
                    inputMode="numeric"
                    className="fr-input"
                  />
                </div>
                {error && (
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={!roomName.trim() || loading}
                  className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
                >
                  {loading ? 'Creating…' : 'Create Room'}
                </button>
              </div>
            )}

            {tab === 'join' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="room-code" className="label-caps">
                    Room code
                  </label>
                  <input
                    id="room-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                    placeholder="Enter code"
                    maxLength={6}
                    className="fr-input fr-input--code"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={joinCode.length < 4 || loading}
                  className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
                >
                  {loading ? 'Looking up…' : 'Enter Room'}
                </button>
              </div>
            )}

            {tab === 'browse' && (
              <div className="space-y-3">
                {browseLoading ? (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    Loading public rooms…
                  </p>
                ) : publicRooms.length === 0 ? (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No public rooms right now. Create one and set it to public!
                  </p>
                ) : (
                  <ul className="-mx-1 max-h-80 space-y-2 overflow-y-auto px-1">
                    {publicRooms.map((room) => (
                      <li
                        key={room.id}
                        className="space-y-2 p-3"
                        style={{
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold" style={{ color: 'var(--text)' }}>
                              {room.name}
                            </p>
                            <p className="font-mono text-xs tracking-wider" style={{ color: 'var(--text-faint)' }}>
                              {room.id}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
                            {room.memberCount} member{room.memberCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {room.description && (
                          <p className="line-clamp-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {room.description}
                          </p>
                        )}
                        {room.timezone && (
                          <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-faint)' }}>
                            <Glyph icon={Clock01Icon} size={13} />
                            {formatRoomTimezone(room.timezone)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => router.push(`/room/${room.id}`)}
                          className="fr-btn fr-btn--secondary fr-btn--sm fr-btn--block"
                        >
                          Join room
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {browseHasMore && !browseLoading && (
                  <button
                    type="button"
                    onClick={() => void loadPublicRooms(browseCursor)}
                    disabled={browseLoadingMore}
                    className="fr-btn fr-btn--secondary fr-btn--sm fr-btn--block"
                  >
                    {browseLoadingMore ? 'Loading…' : 'Load more rooms'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
