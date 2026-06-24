'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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

type Room = { id: string; name: string; created_at: string }

type Member = {
  id: string
  display_name: string
  member_code: string
  joined_at: string
  times_kissed: number
  times_married: number
  times_killed: number
  games_played: number
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

function getSavedIdentity(roomCode: string): Identity | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY(roomCode))
    if (!raw) return null
    return JSON.parse(raw) as Identity
  } catch {
    return null
  }
}

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
}: {
  name: string
  online: boolean
  isYou: boolean
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

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'ready'>('loading')
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [games, setGames] = useState<RoomGame[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('chat')
  const [newGameBanner, setNewGameBanner] = useState<RoomGame | null>(null)
  const [copySuccess, setCopySuccess] = useState<'room' | 'member' | null>(null)

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
    async function init() {
      const res = await fetch(`/api/rooms/${roomCode}`)
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

  // Realtime — members
  useEffect(() => {
    const channel = supabase
      .channel(`room_members:${roomCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomCode}` },
        () => {
          fetch(`/api/rooms/${roomCode}`)
            .then((r) => r.json())
            .then((d) => { if (d.members) setMembers(d.members) })
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

  if (status === 'unauthenticated') {
    return (
      <RoomJoinGate
        roomCode={roomCode}
        roomName={room?.name ?? roomCode}
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
              href={`/game/${newGameBanner.game_id}`}
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
            <p className="label-caps">Room</p>
            <h1 className="font-black text-xl text-body leading-tight mt-1">{room?.name}</h1>
            <p className="text-xs text-faint mt-1">{memberCountLabel}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
            <p className="label-caps px-2 pb-1">Members</p>
            {onlineMembers.map((m) => (
              <MemberRow
                key={m.id}
                name={m.display_name}
                online
                isYou={m.id === identity?.memberId}
              />
            ))}
            {offlineMembers.map((m) => (
              <MemberRow
                key={m.id}
                name={m.display_name}
                online={false}
                isYou={m.id === identity?.memberId}
              />
            ))}
          </div>

          <div className="p-4 border-t border-[var(--border)]">
            <Link href={startGameHref} className="btn-primary text-sm py-2.5" {...OPEN_IN_NEW_TAB}>
              Start a Game
            </Link>
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Mobile room bar */}
          <div className="lg:hidden shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-black text-base text-body truncate">{room?.name}</h1>
                <p className="text-xs text-faint mt-0.5">{memberCountLabel}</p>
              </div>
              <Link href={startGameHref} className="btn-primary btn-fit shrink-0 px-4 py-2 text-sm" {...OPEN_IN_NEW_TAB}>
                Start a Game
              </Link>
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

          <RoomLiveGames games={games} />

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
              <RoomGameHistory games={games} />
            )}
          </div>
        </main>
      </div>

      {/* Member code reminder — shown once */}
      {identity && status === 'ready' && (
        <MemberCodeReminder memberCode={identity.memberCode} displayName={identity.displayName} />
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
