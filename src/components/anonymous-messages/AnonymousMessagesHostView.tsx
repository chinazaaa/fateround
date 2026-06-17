'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnonymousMessageFeed } from '@/components/anonymous-messages/AnonymousMessageFeed'
import { AnonymousRoomSessionSummary } from '@/components/anonymous-messages/AnonymousRoomSessionSummary'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { ResultsPagination, usePagination } from '@/components/ui/ResultsPagination'
import { useAnonymousMessageTrim } from '@/hooks/useAnonymousMessageTrim'
import { useAnonymousMessages } from '@/hooks/useAnonymousMessages'
import { AnonymousSessionTimerBar } from '@/components/anonymous-messages/AnonymousSessionTimerBar'
import {
  ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS,
  ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES,
  ANONYMOUS_ROOM_MIN_PLAYERS,
  anonymousRoomMaxPlayers,
  banSecondsLeft,
  countAnonymousRoomPresence,
  formatBanCountdown,
  isPlayerBanned,
} from '@/lib/anonymous-messages'
import { useAnonymousRoomBans } from '@/hooks/useAnonymousRoomBans'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import type { Game, Player } from '@/types'
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'

const LOBBY_PAGE_SIZE = 10

export function AnonymousMessagesHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null)
  const [mutingPlayerId, setMutingPlayerId] = useState<string | null>(null)
  const [muteMinutes, setMuteMinutes] = useState(ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES)

  const lobbyActionsEnabled = game?.status === 'waiting' || game?.status === 'active'
  const { bans, banForPlayer, reload: reloadBans } = useAnonymousRoomBans(gameCode, !!lobbyActionsEnabled)
  const [, setBanTick] = useState(0)

  useEffect(() => {
    if (!bans.length) return
    const id = window.setInterval(() => setBanTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [bans.length])

  const messagesEnabled = game?.status === 'active'
  const { reactions: reactionsMap } = useAnonymousReactions(gameCode, game?.status === 'active')
  const { messages, removeMessage } = useAnonymousMessages(gameCode, !!messagesEnabled, players)
  useAnonymousMessageTrim(gameCode, !!messagesEnabled)
  const lobbyPagination = usePagination(players.length, LOBBY_PAGE_SIZE)
  const visibleLobbyPlayers = players.slice(lobbyPagination.start, lobbyPagination.end)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`anon-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => setGame(payload.new as Game)
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
          setPlayers((prev) => prev.filter((p) => p.id !== player.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const startSession = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const removeMessageByHost = async (messageId: string) => {
    setRemovingId(messageId)
    try {
      const res = await fetch('/api/anonymous-messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, messageId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove message')
      removeMessage(messageId)
      success('Message removed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove message')
    } finally {
      setRemovingId(null)
    }
  }

  const removePlayerFromLobby = async (playerId: string) => {
    setRemovingPlayerId(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove player')
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      success('Player removed from lobby')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove player')
    } finally {
      setRemovingPlayerId(null)
    }
  }

  const mutePlayer = async (playerId: string) => {
    setMutingPlayerId(playerId)
    try {
      const res = await fetch('/api/anonymous-room/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId, hostToken, durationMinutes: muteMinutes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mute player')
      await reloadBans()
      success(`Player muted for ${muteMinutes} minutes`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mute player')
    } finally {
      setMutingPlayerId(null)
    }
  }

  const unmutePlayer = async (playerId: string) => {
    setMutingPlayerId(playerId)
    try {
      const res = await fetch('/api/anonymous-room/bans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to unmute player')
      await reloadBans()
      success('Player unmuted')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to unmute player')
    } finally {
      setMutingPlayerId(null)
    }
  }

  if (!game) {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const playerLink = `${appOrigin()}/game/${gameCode}`
  const canStart = players.length >= ANONYMOUS_ROOM_MIN_PLAYERS
  const roomCapacity = anonymousRoomMaxPlayers(game)
  const presence = countAnonymousRoomPresence(players, game)

  return (
    <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted text-xs uppercase tracking-wider">Host panel</p>
          <h1 className="text-2xl font-black text-body mt-1">{game.title}</h1>
          <p className="text-muted text-sm">{gameTypeConfig(game.game_type).label}</p>
          <p className="text-[var(--primary)] text-xs mt-1 font-medium">
            Anonymous room — players get auto names shown on messages
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs uppercase tracking-wider">Code</p>
          <p className="text-body font-mono font-black text-2xl tracking-[0.2em]">{gameCode}</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">Player link</p>
        <CopyLinkButton value={playerLink} label="Copy player link" />
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted text-xs uppercase tracking-wider">
            {game.status === 'waiting' ? 'In the lobby' : 'In the room'}
          </p>
          <span className="text-faint text-xs tabular-nums">
            {game.status === 'waiting' ? (
              <>
                {players.length} / {roomCapacity}
              </>
            ) : (
              <>
                {presence.participants} {presence.participants === 1 ? 'player' : 'players'}
                {presence.viewers > 0 && ` · ${presence.viewers} viewing`}
              </>
            )}
          </span>
        </div>
        {lobbyActionsEnabled && players.length > 0 && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-faint text-xs uppercase tracking-wider">Mute duration</span>
            <select
              value={muteMinutes}
              onChange={(e) => setMuteMinutes(Number(e.target.value))}
              className="input-field py-1.5 px-2 text-sm w-auto"
            >
              {ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="space-y-2">
          {players.length === 0 ? (
            <p className="text-muted text-sm">Waiting for players…</p>
          ) : (
            visibleLobbyPlayers.map((player) => {
              const ban = banForPlayer(player.id)
              const muted = isPlayerBanned(ban?.banned_until)
              const mutedLabel = muted && ban ? `Muted · ${formatBanCountdown(banSecondsLeft(ban.banned_until))}` : null

              return (
                <div key={player.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <span className="chip text-xs">{player.name}</span>
                    {mutedLabel && <p className="text-red-300/90 text-[10px] mt-1 tabular-nums">{mutedLabel}</p>}
                  </div>
                  {lobbyActionsEnabled && (
                    <div className="flex shrink-0 items-center gap-2">
                      {muted ? (
                        <button
                          type="button"
                          onClick={() => unmutePlayer(player.id)}
                          disabled={mutingPlayerId === player.id}
                          className="text-faint hover:text-emerald-300 text-xs disabled:opacity-50"
                        >
                          {mutingPlayerId === player.id ? '…' : 'Unmute'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => mutePlayer(player.id)}
                          disabled={mutingPlayerId === player.id}
                          className="text-faint hover:text-amber-300 text-xs disabled:opacity-50"
                        >
                          {mutingPlayerId === player.id ? '…' : 'Mute'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePlayerFromLobby(player.id)}
                        disabled={removingPlayerId === player.id}
                        className="text-faint hover:text-red-400 text-xs disabled:opacity-50"
                      >
                        {removingPlayerId === player.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <ResultsPagination
          page={lobbyPagination.page}
          totalPages={lobbyPagination.totalPages}
          onPageChange={lobbyPagination.setPage}
          totalItems={players.length}
          pageSize={LOBBY_PAGE_SIZE}
          noun="players"
        />
      </div>

      {game.status === 'waiting' && (
        <div className="glass-card p-4">
          <HostAllowViewersField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        </div>
      )}

      {game.status === 'waiting' && (
        <button type="button" onClick={startSession} disabled={!canStart || starting} className="btn-primary w-full">
          {starting
            ? 'Starting…'
            : canStart
              ? 'Start anonymous session'
              : `Need at least ${ANONYMOUS_ROOM_MIN_PLAYERS} players`}
        </button>
      )}

      {game.status === 'active' && (
        <>
          <AnonymousSessionTimerBar gameCode={gameCode} game={game} sticky />
          <AnonymousMessageFeed
            messages={messages}
            title="Live anonymous messages"
            canRemove
            removingId={removingId}
            onRemove={removeMessageByHost}
            reactionsMap={reactionsMap}
            myPlayerName=""
            onReact={() => {}}
          />
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End session"
            confirmTitle="End this session?"
            confirmMessage="Players will see the session summary. You can start a new session from the lobby afterward."
            className="btn-secondary w-full"
          />
        </>
      )}

      {game.status === 'finished' && (
        <>
          <AnonymousRoomSessionSummary game={game} playerCount={players.length} />
          <div className="flex flex-col gap-2">
            <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-primary w-full">
              {playingAgain ? 'Resetting…' : 'Play again'}
            </button>
            <CreateNewGameButton />
          </div>
        </>
      )}
    </div>
  )
}
