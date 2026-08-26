'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HostLobby } from '@/components/host/HostLobby'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { gameTypeConfig } from '@/lib/game-types'
import { RUMMY_MIN_PLAYERS, RUMMY_MAX_PLAYERS } from '@/lib/rummy'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import type { Game, Player, RummyPlayerHand, RummySession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { RummyGamePanel, RummyStandingsBox } from '@/components/rummy/RummyBoard'
import { RummyCard as RummyCardBox, RummyShell } from '@/components/rummy/RummyChrome'
import { useRummyTurnTimer } from '@/hooks/useRummyTurnTimer'
import { useRummyGameTimer } from '@/hooks/useRummyGameTimer'

const RUMMY_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,draw_pile,discard_pile,top_discard,turn_step,status_message,winner_player_id,winning_melds,reshuffle_count,turn_deadline_at,created_at,updated_at'
const RUMMY_HAND_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

/**
 * Rummy host view. The host either watches or takes a seat (see `useHostSeat` below) —
 * when seated they act through the same /api/rummy/* routes as any other player. Uses
 * the shared HostLobby for the waiting phase and the shared RummyGamePanel for the
 * active table view.
 */
export function RummyHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<RummySession | null>(null)
  const [hands, setHands] = useState<RummyPlayerHand[]>([])
  const sessionRef = useRef<RummySession | null>(null)
  sessionRef.current = session
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setLoading(false)
    const [sessionRes, handsRes] = await Promise.all([
      supabase.from('rummy_sessions').select(RUMMY_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('rummy_player_hands').select(RUMMY_HAND_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (supabasePollOk(sessionRes)) setSession(sessionRes.data as RummySession | null)
    if (supabasePollOk(handsRes)) setHands((handsRes.data as RummyPlayerHand[]) ?? [])
    return supabasePollOk(sessionRes) && supabasePollOk(handsRes)
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])

  const connected = useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, { table: 'rummy_sessions' }, { table: 'rummy_player_hands' }],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  // Host seat: host may play as a seated player OR stay spectator (checklist #7). When
  // seated, they get a resume token and act through the same /api/rummy/* routes as
  // anyone else — no bespoke "host action" API.
  const {
    hostMode,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveGameRemovePlayer,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
  })

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const activePlayers = players.filter((p) => !p.spectator)

  const startGame = useCallback(async () => {
    if (starting) return
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameCode)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, starting, load, toastError])

  const playAgain = useCallback(
    async (sameSettings: boolean) => {
      if (playingAgain) return
      setPlayingAgain(true)
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameCode)}/play-again`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, same_settings: sameSettings }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to reopen lobby')
        success(sameSettings ? 'Re-dealing…' : 'Lobby reopened')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed')
      } finally {
        setPlayingAgain(false)
      }
    },
    [gameCode, hostToken, playingAgain, success, toastError, load]
  )

  const { removePlayer } = useHostRemovePlayer(gameCode, hostToken, (playerId: string) => {
    onHostSeatRemoved(playerId)
    void load()
  })

  const callAction = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!hostResumeToken) {
        toastError('Join a seat first to play')
        return
      }
      setActing(true)
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) toastError(data.error ?? 'Action failed')
        else await load()
      } finally {
        setActing(false)
      }
    },
    [gameCode, hostResumeToken, load, toastError]
  )

  // Timers must be unconditional (rules-of-hooks) — call them before the early return.
  const hostTurnTimer = useRummyTurnTimer(gameCode, session, game?.status === 'active')
  const hostGameTimer = useRummyGameTimer(gameCode, game)

  if (loading || !game) return <HostLobbySkeleton />

  const cfg = gameTypeConfig('rummy')
  const winnerName = players.find((p) => p.id === session?.winner_player_id)?.name
  const gameFinished = session?.phase === 'finished' || game.status === 'finished'
  const maxPlayers = lobbyMaxPlayersFromGameClient('rummy', game) ?? RUMMY_MAX_PLAYERS
  const canStart = activePlayers.length >= RUMMY_MIN_PLAYERS

  if (game.status === 'waiting') {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        players={players}
        maxPlayers={maxPlayers}
        onStart={startGame}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={canStart ? null : `Need at least ${RUMMY_MIN_PLAYERS} players`}
        onRemovePlayer={removePlayer}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
        playCard={
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            onEditName={renameHost}
            spectatorHint="Watch the room; don't take a seat"
          />
        }
      >
        <HostBoardGameLobbyPanel
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          boardGameType="rummy"
          playerCount={players.length}
          seatedCount={activePlayers.length}
          onGameUpdate={setGame}
        />
      </HostLobby>
    )
  }

  if (gameFinished) {
    return (
      <RummyShell title={game.title ?? cfg.label} compact>
        <RummyCardBox className="p-4 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <p className="text-xl font-black">{winnerName ? `${winnerName} wins!` : 'Round ended'}</p>
          {session?.status_message && <p className="text-sm text-muted">{session.status_message}</p>}
        </RummyCardBox>
        {session && <RummyStandingsBox session={session} players={players} hands={hands} myPlayerId={null} />}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-secondary py-2"
            onClick={() => void playAgain(false)}
            disabled={playingAgain}
          >
            Reopen lobby
          </button>
          <button
            type="button"
            className="btn-primary py-2"
            onClick={() => void playAgain(true)}
            disabled={playingAgain}
          >
            Play again · same settings
          </button>
        </div>
      </RummyShell>
    )
  }

  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const hostHand = hostPlayerId
    ? ((hands.find((h) => h.player_id === hostPlayerId)?.cards as import('@/types').RummyCard[] | null) ?? null)
    : null
  const isHostTurn = hostPlays && session ? session.turn_order[session.current_turn_index] === hostPlayerId : false

  return (
    <RummyShell title={game.title ?? cfg.label} compact wide>
      {session && (
        <RummyGamePanel
          session={session}
          players={players}
          myPlayerId={hostPlays ? hostPlayerId : null}
          myHand={hostPlays ? hostHand : null}
          isMyTurn={isHostTurn}
          isViewer={!hostPlays}
          acting={acting}
          secondsLeft={hostTurnTimer.secondsLeft}
          hasTimer={hostTurnTimer.hasTimer}
          urgent={hostTurnTimer.urgent}
          gameCountdown={hostGameTimer.active ? hostGameTimer.label : null}
          gameSecondsLeft={hostGameTimer.secondsLeft}
          gameDurationSeconds={hostGameTimer.durationSeconds}
          onDraw={hostPlays ? (source) => void callAction('/api/rummy/draw', { source }) : undefined}
          onDiscard={hostPlays ? (cardId) => void callAction('/api/rummy/discard', { cardId }) : undefined}
          onGoOut={
            hostPlays
              ? (melds, discardCardId) => void callAction('/api/rummy/go-out', { melds, discardCardId })
              : undefined
          }
        />
      )}
      <div className="pt-2 space-y-2">
        {hostPlays && (
          <button type="button" className="btn-secondary w-full py-2" onClick={leaveGameRemovePlayer}>
            Leave the table (keep hosting)
          </button>
        )}
        <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} />
      </div>
    </RummyShell>
  )
}
