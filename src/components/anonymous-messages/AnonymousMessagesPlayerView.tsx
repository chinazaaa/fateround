'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnonymousMessageFeed } from '@/components/anonymous-messages/AnonymousMessageFeed'
import { AnonymousBanCountdownBar } from '@/components/anonymous-messages/AnonymousBanCountdownBar'
import { AnonymousMessageComposer } from '@/components/anonymous-messages/AnonymousMessageComposer'
import { AnonymousRoomSessionSummary } from '@/components/anonymous-messages/AnonymousRoomSessionSummary'
import { GameLobbySummary } from '@/components/GameLobbySummary'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { useAnonymousMessageTrim } from '@/hooks/useAnonymousMessageTrim'
import { useAnonymousMessages } from '@/hooks/useAnonymousMessages'
import { AnonymousSessionTimerBar } from '@/components/anonymous-messages/AnonymousSessionTimerBar'
import { AnonymousRoomHeadcount } from '@/components/anonymous-messages/AnonymousRoomHeadcount'
import { gameTypeConfig } from '@/lib/game-types'
import {
  anonymousPlayerCanChat,
  anonymousPlayerCanPost,
  anonymousRoomMaxPlayers,
  isPlayerBanned,
} from '@/lib/anonymous-messages'
import { useAnonymousRoomBans } from '@/hooks/useAnonymousRoomBans'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { AnonymousMessage, Game, Player } from '@/types'
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin } from '@/hooks/useRoomMemberJoin'
import { markPlayerReady } from '@/lib/player-ready'
import { allowLateJoin, playerIsViewer, preJoinScreen } from '@/lib/viewers'

type Screen =
  'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'waiting' | 'active' | 'finished' | 'not_found'

export function AnonymousMessagesPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joining, setJoining] = useState(false)
  const { memberCode, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [messageInput, setMessageInput] = useState('')
  const [replyTo, setReplyTo] = useState<AnonymousMessage | null>(null)
  const [sending, setSending] = useState(false)

  const messagesEnabled = screen === 'active'
  const bansEnabled = screen === 'active' || screen === 'waiting'
  const { messages } = useAnonymousMessages(gameCode, messagesEnabled, players)
  const { banForPlayer } = useAnonymousRoomBans(gameCode, bansEnabled)
  const { broadcastReaction, reactions: reactionsMap } = useAnonymousReactions(gameCode, screen === 'active')
  useAnonymousMessageTrim(gameCode, screen === 'active')

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (gameData.status === 'waiting') {
      setScreen(playerId ? 'waiting' : 'join')
      return
    }
    if (gameData.status === 'active') {
      if (!playerId) {
        setScreen(allowLateJoin(gameData) ? 'join' : 'game_started_waiting')
        return
      }
      setScreen('active')
      return
    }
    setScreen(playerId ? 'finished' : 'game_ended')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
    }
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`anon-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          syncScreen(next, myPlayerId)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.new as Player
          setPlayers((prev) => (prev.some((p) => p.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.old as Player
          if (player.id === myPlayerId) {
            clearPlayerSession(gameCode)
            setMyPlayerId(null)
            setMyPlayerName('')
            setScreen('join')
            toastError('You were removed from the room')
          }
          setPlayers((prev) => prev.filter((p) => p.id !== player.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, myPlayerId, syncScreen, toastError])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting' || screen === 'finished') void load()
  })

  const join = useCallback(async () => {
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, ...joinExtras }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')

      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setMyPlayerId(data.playerId)
      setMyPlayerName(data.playerName)
      await load()
      success(data.canChat === false ? `Joined as ${data.playerName} — view only` : `Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }, [gameCode, joinExtras, load, success, toastError])

  useRoomMemberAutoJoin({
    gameCode,
    autoJoinWithoutName: !!memberCode,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: () => join(),
  })

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || !myPlayerId) return

    setSending(true)
    try {
      const res = await fetch('/api/anonymous-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          text,
          ...(replyTo ? { replyToId: replyTo.id } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send message')
      setMessageInput('')
      setReplyTo(null)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    setScreen('join')
  }

  const sendGif = async (mediaUrl: string) => {
    if (!myPlayerId) return
    setSending(true)
    try {
      const res = await fetch('/api/anonymous-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          text: '',
          messageType: 'gif',
          mediaUrl,
          ...(replyTo ? { replyToId: replyTo.id } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setReplyTo(null)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to send GIF')
    } finally {
      setSending(false)
    }
  }

  if (screen === 'loading') {
    return (
      <CenteredShell>
        <p className="text-muted text-center">Loading…</p>
      </CenteredShell>
    )
  }

  if (screen === 'not_found') {
    return (
      <CenteredShell>
        <p className="text-center font-bold text-xl">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-primary w-full">
          Back home
        </button>
      </CenteredShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <CenteredShell>
          <p className="text-muted text-lg text-center">Joining from your game room…</p>
        </CenteredShell>
      )
    }

    const sessionInProgress = game?.status === 'active'
    const roomCapacity = game ? anonymousRoomMaxPlayers(game) : null
    const lobbyFull = game?.status === 'waiting' && roomCapacity != null && players.length >= roomCapacity
    return (
      <CenteredShell>
        <Header game={game} />
        {game && <AnonymousRoomHeadcount game={game} players={players} />}
        <p className="text-muted text-sm text-center">
          {lobbyFull ? (
            <>
              This room is full ({roomCapacity} players max).
              <span className="block mt-2 text-faint">
                Stick around — once the host starts, you can join as a viewer and watch live (read-only).
              </span>
            </>
          ) : sessionInProgress ? (
            'This session is already in progress. You can join to watch live — late joiners cannot send messages.'
          ) : (
            "Join the anonymous room — you'll get a random lobby name shown on your messages."
          )}
        </p>
        <button
          type="button"
          onClick={() => void join()}
          disabled={joining || lobbyFull}
          className="btn-primary w-full"
        >
          {joining
            ? 'Joining…'
            : lobbyFull
              ? 'Lobby full — check back when live'
              : sessionInProgress
                ? 'Join as viewer'
                : 'Join anonymously'}
        </button>
        <ShareGameLinkCard gameCode={gameCode} />
      </CenteredShell>
    )
  }

  if (screen === 'waiting') {
    const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null
    return (
      <CenteredShell>
        <Header game={game} />
        {game && <AnonymousRoomHeadcount game={game} players={players} />}
        <PlayerBar name={myPlayerName} />
        <LobbyPlayers players={players} game={game} />
        {me?.spectator === true ? (
          <div className="space-y-2 text-center">
            <p className="text-muted text-sm">Tap below to join the next session</p>
            <button
              type="button"
              onClick={async () => {
                const resumeToken = getPlayerSession(gameCode)?.resumeToken
                if (!resumeToken) return
                await markPlayerReady(gameCode, resumeToken)
                await load()
              }}
              className="btn-primary w-full py-3 text-base font-bold"
            >
              I&apos;m in — ready to play
            </button>
          </div>
        ) : (
          <p className="text-muted text-sm text-center">Waiting for the host to start the session…</p>
        )}
        {myPlayerId && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myPlayerName}
            onRenamed={() => {}}
            onLeft={handlePlayerLeft}
            leaveOnly
            inLobby
          />
        )}
        <ShareGameLinkCard gameCode={gameCode} />
      </CenteredShell>
    )
  }

  if (screen === 'finished') {
    // The summary card is self-contained (🎭 + status), so the page header would just
    // stack a second centered header on top of it.
    return (
      <PageShell>
        <AnonymousRoomSessionSummary game={game!} playerCount={players.length} />
        <CreateNewGameButton />
      </PageShell>
    )
  }

  const myPlayer = players.find((p) => p.id === myPlayerId) ?? null
  const myBan = myPlayerId ? banForPlayer(myPlayerId) : null
  const isMuted = isPlayerBanned(myBan?.banned_until)
  const canChat = game && myPlayer ? anonymousPlayerCanChat(myPlayer, game) : false
  const canPost = game && myPlayer ? anonymousPlayerCanPost(myPlayer, game, myBan?.banned_until) : false

  return (
    <PageShell>
      <Header game={game} />
      {game && <AnonymousRoomHeadcount game={game} players={players} />}
      <AnonymousSessionTimerBar gameCode={gameCode} game={game} sticky />
      {isMuted && myBan && <AnonymousBanCountdownBar bannedUntil={myBan.banned_until} />}
      <PlayerBar
        name={myPlayerName}
        subtitle={
          isMuted
            ? 'Muted — you can read but not send messages'
            : canChat
              ? 'Your lobby name — shown on your messages'
              : 'View-only — you joined after the session started'
        }
      />
      {!canPost && (
        <p className="callout-warning text-sm text-center">
          {isMuted
            ? 'You are muted by the host — read-only until the timer ends.'
            : 'View-only mode — you can read messages but cannot send or reply.'}
        </p>
      )}
      <AnonymousMessageFeed
        messages={messages}
        readOnly={!canPost}
        canReply={canPost}
        onReply={canPost ? setReplyTo : undefined}
        highlightMessageId={replyTo?.id ?? null}
        reactionsMap={reactionsMap}
        myPlayerName={myPlayerName ?? 'Unknown'}
        onReact={(messageId, emoji, action) => broadcastReaction(messageId, emoji, myPlayerName ?? 'Unknown', action)}
      />
      {canPost && (
        <AnonymousMessageComposer
          value={messageInput}
          onChange={setMessageInput}
          onSend={sendMessage}
          onSendGif={sendGif}
          sending={sending}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
        />
      )}
      {myPlayerId && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myPlayerName}
          onRenamed={() => {}}
          onLeft={handlePlayerLeft}
          leaveOnly
        />
      )}
    </PageShell>
  )
}

function Header({ game }: { game: Game | null }) {
  if (!game) return null
  return (
    <div className="text-center space-y-1">
      <div className="text-4xl">{gameTypeConfig(game.game_type).headerEmoji}</div>
      <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
      <GameTypeBadge gameType={game.game_type} />
      <GameLobbySummary game={game} className="pt-1" />
    </div>
  )
}

function PlayerBar({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <div className="glass-card px-4 py-3 text-center">
      <p className="text-faint text-xs uppercase tracking-wider">Your lobby name</p>
      <p className="font-bold text-body">{name}</p>
      {subtitle && <p className="text-faint text-xs mt-1">{subtitle}</p>}
    </div>
  )
}

function LobbyPlayers({ players, game }: { players: Player[]; game: Game | null }) {
  const capacity = game ? anonymousRoomMaxPlayers(game) : null
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs uppercase tracking-wider">Lobby names</p>
        <span className="text-faint text-xs tabular-nums">
          {players.length}
          {capacity != null ? ` / ${capacity}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <span key={player.id} className="chip text-xs">
            {player.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrap flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">{children}</div>
    </div>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="page-wrap px-4 py-8 max-w-lg mx-auto w-full space-y-5">{children}</div>
}
