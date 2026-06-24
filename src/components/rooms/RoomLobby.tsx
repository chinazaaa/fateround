'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RoomJoinGate } from '@/components/rooms/RoomJoinGate'
import { RoomChat } from '@/components/rooms/RoomChat'
import { RoomLeaderboard } from '@/components/rooms/RoomLeaderboard'
import { RoomGameHistory } from '@/components/rooms/RoomGameHistory'
import { RoomLiveGames } from '@/components/rooms/RoomLiveGames'
import {
  OPEN_IN_NEW_TAB,
  roomGameBannerDetails,
  roomGameDisplay,
  type RoomGame,
} from '@/components/rooms/room-game-display'
import { gamePathWithRoomMember } from '@/lib/room-member-join'
import { RoomSettings } from '@/components/rooms/RoomSettings'
import { formatRoomTimezone } from '@/lib/room-timezones'
import type { RoomRow } from '@/lib/room-api'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type Room = RoomRow

type Member = {
  id: string
  display_name: string
  member_code: string
  joined_at: string
  times_kissed: number
  times_married: number
  times_killed: number
  games_played: number
  room_points: number
}

type Message = {
  id: string
  display_name: string
  text: string
  created_at: string
  member_id: string | null
}

type Identity = { memberId: string; memberCode: string; displayName: string }

const MEMBER_KEY = (code: string) => `kmk_room_${code}_member`
const CREATOR_KEY = (code: string) => `kmk_room_${code}_creator`

function getSavedIdentity(roomCode: string): Identity | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY(roomCode))
    if (!raw) return null
    return JSON.parse(raw) as Identity
  } catch {
    return null
  }
}

function getSavedCreatorToken(roomCode: string): string | null {
  try { return localStorage.getItem(CREATOR_KEY(roomCode)) } catch { return null }
}

type Status = 'loading' | 'not_found' | 'removed' | 'unauthenticated' | 'ready'
type Tab = 'chat' | 'leaderboard' | 'history'

function memberInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function MemberAvatar({ name, online }: { name: string; online: boolean }) {
  return (
    <span
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        online ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'bg-[var(--surface)] text-muted'
      }`}
    >
      {memberInitial(name)}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] ${
          online ? 'bg-green-400' : 'bg-[var(--muted)]'
        }`}
      />
    </span>
  )
}

function MemberRow({
  name,
  online,
  isYou,
  onRemove,
}: {
  name: string
  online: boolean
  isYou: boolean
  onRemove?: () => void
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${
        online ? 'bg-[var(--surface)]/80' : 'opacity-60'
      }`}
    >
      <MemberAvatar name={name} online={online} />
      <span className="min-w-0 flex-1 truncate text-sm text-body">
        {name}
        {isYou && <span className="ml-1 text-xs text-faint">(you)</span>}
      </span>
      {onRemove && !isYou && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove member"
          className="shrink-0 text-faint hover:text-red-400 active:text-red-400 transition-colors text-base leading-none px-1"
        >
          ×
        </button>
      )}
    </div>
  )
}

function MemberChip({
  name,
  online,
  isYou,
}: {
  name: string
  online: boolean
  isYou: boolean
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${online ? 'bg-green-400' : 'bg-[var(--muted)]'}`} />
      <span className="whitespace-nowrap text-xs text-body">
        {name}
        {isYou && <span className="text-faint"> (you)</span>}
      </span>
    </div>
  )
}

function RoomMeta({ room }: { room: Room }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            room.is_public
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-[var(--surface)] text-faint border border-[var(--border)]'
          }`}
        >
          {room.is_public ? '🌐 Public' : '🔒 Private'}
        </span>
        {room.is_locked && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/20">
            🔐 Locked
          </span>
        )}
        {room.timezone && (
          <span className="text-[10px] text-faint">🕐 {formatRoomTimezone(room.timezone)}</span>
        )}
      </div>
      {room.description && (
        <p className="text-xs text-muted leading-relaxed">{room.description}</p>
      )}
    </div>
  )
}

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<Status>('loading')
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [games, setGames] = useState<RoomGame[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('chat')
  const [newGameBanner, setNewGameBanner] = useState<RoomGame | null>(null)
  const [copySuccess, setCopySuccess] = useState<'room' | 'member' | null>(null)
  const [creatorToken, setCreatorToken] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const identityRef = useRef(identity)
  identityRef.current = identity
  const router = useRouter()
  const { confirm } = useConfirm()

  const refreshGames = useCallback(() => {
    fetch(`/api/rooms/${roomCode}/games`)
      .then((r) => r.json())
      .then((d) => {
        if (d.games) setGames(d.games)
      })
      .catch(() => { /* noop */ })
  }, [roomCode])

  // Initial load
  useEffect(() => {
    setCreatorToken(getSavedCreatorToken(roomCode))
  }, [roomCode])

  useEffect(() => {
    async function init() {
      const res = await fetch(`/api/rooms/${roomCode}`)
      if (res.status === 404) { setStatus('not_found'); return }
      if (!res.ok) { setStatus('unauthenticated'); return }
      const data = await res.json()
      setRoom(data.room)
      setMembers(data.members ?? [])
      setGames(data.recentGames ?? [])

      const saved = getSavedIdentity(roomCode)
      if (saved) {
        // Verify saved identity is still valid
        const verify = await fetch(`/api/rooms/${roomCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberCode: saved.memberCode }),
        })
        if (verify.ok) {
          setIdentity(saved)
          setStatus('ready')
        } else {
          localStorage.removeItem(MEMBER_KEY(roomCode))
          setStatus('unauthenticated')
        }
      } else {
        setStatus('unauthenticated')
      }

      // Load messages
      const msgRes = await fetch(`/api/rooms/${roomCode}/messages`)
      if (msgRes.ok) {
        const msgData = await msgRes.json()
        setMessages(msgData.messages ?? [])
      }
    }
    init()
  }, [roomCode])

  // Realtime — messages
  useEffect(() => {
    const channel = supabase
      .channel(`room_messages:${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomCode}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  // Realtime — room settings & deletion
  useEffect(() => {
    const channel = supabase
      .channel(`room_meta:${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomCode}` },
        (payload) => {
          const next = payload.new as Room
          setRoom((prev) => (prev ? { ...prev, ...next } : next))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomCode}` },
        () => {
          localStorage.removeItem(MEMBER_KEY(roomCode))
          localStorage.removeItem(CREATOR_KEY(roomCode))
          setStatus('not_found')
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  // Realtime — members
  useEffect(() => {
    const refreshMembers = () => {
      fetch(`/api/rooms/${roomCode}`)
        .then((r) => {
          if (r.status === 404) {
            localStorage.removeItem(MEMBER_KEY(roomCode))
            localStorage.removeItem(CREATOR_KEY(roomCode))
            setStatus('not_found')
            return null
          }
          return r.json()
        })
        .then((d) => { if (d?.members) setMembers(d.members) })
    }

    const channel = supabase
      .channel(`room_members:${roomCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomCode}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id
            if (deletedId) {
              setMembers((prev) => prev.filter((m) => m.id !== deletedId))
            }
            fetch(`/api/rooms/${roomCode}`)
              .then((r) => {
                if (r.status === 404) {
                  localStorage.removeItem(MEMBER_KEY(roomCode))
                  localStorage.removeItem(CREATOR_KEY(roomCode))
                  setStatus('not_found')
                  return null
                }
                return r.json()
              })
              .then((d) => {
                if (!d) return
                if (deletedId && identityRef.current?.memberId === deletedId) {
                  localStorage.removeItem(MEMBER_KEY(roomCode))
                  setIdentity(null)
                  setStatus('removed')
                  return
                }
                if (d.members) setMembers(d.members)
              })
            return
          }
          refreshMembers()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  // Realtime — games
  useEffect(() => {
    const channel = supabase
      .channel(`room_games:${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_games', filter: `room_id=eq.${roomCode}` },
        () => {
          fetch(`/api/rooms/${roomCode}/games`)
            .then((r) => r.json())
            .then((d) => {
              if (d.games) {
                setGames(d.games)
                const newest = d.games[0] as RoomGame | undefined
                if (newest) setNewGameBanner(newest)
              }
            })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  // Refresh game list when returning to the tab or while games are live
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshGames()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshGames])

  useEffect(() => {
    const hasLive = games.some((g) => roomGameDisplay(g).isLive)
    if (!hasLive) return
    const id = window.setInterval(refreshGames, 30_000)
    return () => window.clearInterval(id)
  }, [games, refreshGames])

  // Presence — who's online
  useEffect(() => {
    if (!identity) return
    const presenceChannel = supabase.channel(`room_presence:${roomCode}`)
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ memberId: string }>()
        const online = new Set(Object.values(state).flat().map((p) => p.memberId))
        setOnlineIds(online)
      })
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') {
          await presenceChannel.track({ memberId: identity.memberId })
        }
      })
    return () => { supabase.removeChannel(presenceChannel) }
  }, [roomCode, identity])

  const handleJoined = useCallback((id: Identity) => {
    setIdentity(id)
    setStatus('ready')
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!identity) return
    await fetch(`/api/rooms/${roomCode}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode: identity.memberCode, text }),
    })
  }, [roomCode, identity])

  const endRoom = useCallback(async () => {
    if (!creatorToken) return
    const ok = await confirm({
      title: 'End this room?',
      message: 'This will permanently delete the room, all chat messages, and the leaderboard for everyone.',
      confirmLabel: 'End room',
      destructive: true,
    })
    if (!ok) return

    const res = await fetch(`/api/rooms/${roomCode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorToken }),
    })
    if (res.ok) {
      localStorage.removeItem(CREATOR_KEY(roomCode))
      localStorage.removeItem(MEMBER_KEY(roomCode))
      router.push('/rooms')
    }
  }, [confirm, creatorToken, roomCode, router])

  const removeMember = useCallback(async (memberId: string, name: string) => {
    if (!creatorToken) return
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'They will be removed from the room and their stats will be deleted.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return

    await fetch(`/api/rooms/${roomCode}/members/${memberId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorToken }),
    })
  }, [confirm, creatorToken, roomCode])

  const copyText = (text: string, which: 'room' | 'member') => {
    navigator.clipboard.writeText(text)
    setCopySuccess(which)
    setTimeout(() => setCopySuccess(null), 2000)
  }

  if (status === 'loading') {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
          Loading room…
        </div>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-5 text-center">
          <div className="space-y-2">
            <div className="text-4xl">🏠</div>
            <h1 className="text-2xl font-black text-body">Room {roomCode}</h1>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-bold text-body">This room has ended</p>
            <p className="text-muted text-sm leading-relaxed">
              The creator closed this room. Ask them to create a new one and share the code.
            </p>
          </div>
          <a href="/rooms" className="btn-secondary block">
            Go to Game Rooms
          </a>
        </div>
      </div>
    )
  }

  if (status === 'removed') {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-5 text-center">
          <div className="space-y-2">
            <div className="text-4xl">🚪</div>
            <h1 className="text-2xl font-black text-body">Removed from room</h1>
          </div>
          <div className="space-y-2">
            <p className="text-muted text-sm leading-relaxed">
              The host removed you from this room. You can join again with the room code if they invite you back.
            </p>
          </div>
          <a href="/rooms" className="btn-secondary block">
            Go to Game Rooms
          </a>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <RoomJoinGate
        roomCode={roomCode}
        roomName={room?.name ?? roomCode}
        isLocked={room?.is_locked}
        description={room?.description}
        timezone={room?.timezone}
        onJoined={handleJoined}
      />
    )
  }

  const onlineMembers = members.filter((m) => onlineIds.has(m.id))
  const offlineMembers = members.filter((m) => !onlineIds.has(m.id))
  const memberCountLabel = `${members.length} member${members.length !== 1 ? 's' : ''}${
    onlineMembers.length > 0 ? ` · ${onlineMembers.length} online` : ''
  }`
  const startGameHref = `/create?room=${roomCode}&member=${identity?.memberCode ?? ''}`
  const newGameBannerDetails = newGameBanner ? roomGameBannerDetails(newGameBanner) : null

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-3 bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border)]">
        <Link href="/" className="pointer-events-auto shrink-0 min-w-0">
          <FateRoundLogo className="h-7 w-auto max-w-[7rem] sm:max-w-[8rem]" />
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => copyText(roomCode, 'room')}
            aria-label="Copy room code"
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 sm:px-3 py-1.5 text-xs font-mono font-bold tracking-widest hover:border-[var(--border-strong)] transition-colors"
          >
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-faint font-sans font-semibold">Room</span>
            {roomCode}
            <span className="text-faint">{copySuccess === 'room' ? '✓' : '⎘'}</span>
          </button>
          {identity && (
            <button
              type="button"
              onClick={() => copyText(identity.memberCode, 'member')}
              aria-label="Copy your player code"
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 sm:px-3 py-1.5 text-xs font-mono font-bold tracking-widest hover:border-[var(--border-strong)] transition-colors"
            >
              <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-faint font-sans font-semibold">Player</span>
              {identity.memberCode}
              <span className="text-faint">{copySuccess === 'member' ? '✓' : '⎘'}</span>
            </button>
          )}
          <ThemeToggle variant="inline" />
        </div>
      </header>

      {/* New game banner */}
      {newGameBanner && newGameBannerDetails && (
        <div className="fixed top-16 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="glass-card-strong flex items-center gap-3 px-4 py-3 pointer-events-auto shadow-lg animate-in slide-in-from-top-2 duration-300">
            <span className="text-xl">{newGameBannerDetails.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-body">{newGameBannerDetails.headline}</p>
              {newGameBannerDetails.subtitle && (
                <p className="text-xs text-faint truncate">{newGameBannerDetails.subtitle}</p>
              )}
            </div>
            <Link
              href={gamePathWithRoomMember(newGameBanner.game_id, identity?.memberCode)}
              className="btn-primary btn-fit px-4 py-1.5 text-sm"
              onClick={() => setNewGameBanner(null)}
              {...OPEN_IN_NEW_TAB}
            >
              Join
            </Link>
            <button
              type="button"
              onClick={() => setNewGameBanner(null)}
              className="text-faint hover:text-body text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="pt-14 flex flex-col lg:flex-row h-dvh overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-64 xl:w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]/30">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="label-caps">Room</p>
                <h1 className="font-black text-xl text-body leading-tight mt-1">{room?.name}</h1>
                <p className="text-xs text-faint mt-1">{memberCountLabel}</p>
              </div>
              {creatorToken && room && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title="Room settings"
                  className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-body transition-colors"
                >
                  ⚙️
                </button>
              )}
            </div>
            {room && <div className="mt-3"><RoomMeta room={room} /></div>}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
            <p className="label-caps px-2 pb-1">Members</p>
            {onlineMembers.map((m) => (
              <MemberRow
                key={m.id}
                name={m.display_name}
                online
                isYou={m.id === identity?.memberId}
                onRemove={creatorToken ? () => void removeMember(m.id, m.display_name) : undefined}
              />
            ))}
            {offlineMembers.map((m) => (
              <MemberRow
                key={m.id}
                name={m.display_name}
                online={false}
                isYou={m.id === identity?.memberId}
                onRemove={creatorToken ? () => void removeMember(m.id, m.display_name) : undefined}
              />
            ))}
          </div>

          <div className="p-4 border-t border-[var(--border)] flex flex-col gap-2">
            <Link
              href={startGameHref}
              className="btn-primary w-full text-sm py-2.5 text-center !flex justify-center"
              {...OPEN_IN_NEW_TAB}
            >
              Start a Game
            </Link>
            {creatorToken && (
              <button
                type="button"
                onClick={() => void endRoom()}
                className="w-full rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-semibold py-2.5 hover:bg-red-500/10 transition-colors"
              >
                End room
              </button>
            )}
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Mobile room bar */}
          <div className="lg:hidden shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <h1 className="font-black text-base text-body truncate">{room?.name}</h1>
                <p className="text-xs text-faint mt-0.5">{memberCountLabel}</p>
              </div>
              {creatorToken && room && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title="Room settings"
                  className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-body transition-colors"
                >
                  ⚙️
                </button>
              )}
            </div>
            {room && <RoomMeta room={room} />}
            <div className="flex flex-col gap-2">
              <Link
                href={startGameHref}
                className="btn-primary w-full text-sm py-2.5 text-center !flex justify-center"
                {...OPEN_IN_NEW_TAB}
              >
                Start a Game
              </Link>
              {creatorToken && (
                <button
                  type="button"
                  onClick={() => void endRoom()}
                  className="w-full rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-semibold py-2.5 hover:bg-red-500/10 transition-colors"
                >
                  End room
                </button>
              )}
            </div>
            {members.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {onlineMembers.map((m) => (
                  <MemberChip
                    key={m.id}
                    name={m.display_name}
                    online
                    isYou={m.id === identity?.memberId}
                  />
                ))}
                {offlineMembers.map((m) => (
                  <MemberChip
                    key={m.id}
                    name={m.display_name}
                    online={false}
                    isYou={m.id === identity?.memberId}
                  />
                ))}
              </div>
            )}
          </div>

          <RoomLiveGames games={games} memberCode={identity?.memberCode} />

          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-[var(--border)] bg-[var(--background)]/50">
            {(['chat', 'leaderboard', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold capitalize transition-colors border-b-2 ${
                  tab === t
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-muted hover:text-body'
                }`}
              >
                {t === 'chat' && '💬 '}
                {t === 'leaderboard' && '🏆 '}
                {t === 'history' && '📋 '}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--background)]">
            {tab === 'chat' && identity && (
              <div className="h-full flex flex-col">
                <RoomChat
                  messages={messages}
                  myMemberId={identity.memberId}
                  onSend={sendMessage}
                />
              </div>
            )}
            {tab === 'leaderboard' && (
              <RoomLeaderboard members={members} />
            )}
            {tab === 'history' && (
              <RoomGameHistory games={games} memberCode={identity?.memberCode} />
            )}
          </div>
        </main>
      </div>

      {/* Member code reminder — shown once */}
      {identity && status === 'ready' && (
        <MemberCodeReminder memberCode={identity.memberCode} displayName={identity.displayName} />
      )}

      {creatorToken && room && (
        <RoomSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          roomCode={roomCode}
          creatorToken={creatorToken}
          room={room}
          onUpdated={setRoom}
        />
      )}
    </>
  )
}

function MemberCodeReminder({ memberCode, displayName }: { memberCode: string; displayName: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(`kmk_room_code_seen_${memberCode}`) } catch { return false }
  })
  const [copied, setCopied] = useState(false)

  const dismiss = () => {
    try { localStorage.setItem(`kmk_room_code_seen_${memberCode}`, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  const copy = () => {
    navigator.clipboard.writeText(memberCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (dismissed) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-none">
      <div className="glass-card-strong p-4 max-w-sm w-full pointer-events-auto space-y-3 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-body text-sm">Save your member code, {displayName}!</p>
            <p className="text-xs text-faint mt-0.5">Use it to rejoin as yourself on any device.</p>
          </div>
          <button type="button" onClick={dismiss} className="text-faint hover:text-body text-lg leading-none shrink-0">×</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center font-mono font-bold text-xl tracking-[0.2em]">
            {memberCode}
          </div>
          <button type="button" onClick={copy} className="btn-secondary shrink-0 px-4 py-2 text-sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button type="button" onClick={dismiss} className="text-center w-full text-xs text-faint hover:text-body transition-colors">
          I&apos;ve saved it
        </button>
      </div>
    </div>
  )
}
