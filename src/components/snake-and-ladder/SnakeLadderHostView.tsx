'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getSnakeLadderHostMode,
  SNAKE_LADDER_MIN_PLAYERS,
  setSnakeLadderHostMode,
  type SnakeLadderHostMode,
} from '@/lib/snake-and-ladder'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  SNAKE_LADDER_PLAYER_STATE_SELECT,
  SNAKE_LADDER_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import {
  useSnakeLadderNotifications,
  useSnakeLadderTurnTimer,
  playSnakeLadderActionSound,
  playSnakeLadderRollSound,
} from '@/hooks/useSnakeLadder'
import { SnakeLadderGamePanel } from '@/components/snake-and-ladder/SnakeLadderBoard'
import { SnakeLadderFinalResultsShareBlock } from '@/components/snake-and-ladder/SnakeLadderFinalResultsShareBlock'
import { SnakeLadderCard, SnakeLadderPrimaryButton } from '@/components/snake-and-ladder/SnakeLadderChrome'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

const ROLL_MIN_MS = 700
/** After someone reaches 100, linger on the board so everyone sees the winning
 *  move before the final leaderboard appears. */
const WIN_HOLD_MS = 9000

type HostTab = 'play' | 'manage'

export function SnakeLadderHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<SnakeLadderSession | null>(null)
  const [states, setStates] = useState<SnakeLadderPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostModeState] = useState<SnakeLadderHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayRoll, setDisplayRoll] = useState<number | null>(null)
  const [holdWin, setHoldWin] = useState(false)
  const winHandledRef = useRef(false)
  const sawActiveRef = useRef(false)
  const rollStartedRef = useRef(0)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, statesRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('snake_ladder_sessions').select(SNAKE_LADDER_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('snake_ladder_player_state')
        .select(SNAKE_LADDER_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, statesRes)) return false
    if (!gameRes.data) {
      setNotFound(true)
      return true
    }
    setNotFound(false)
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as SnakeLadderSession | null)
    setStates((statesRes.data as SnakeLadderPlayerState[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getSnakeLadderHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'snake_ladder_sessions', 'snake_ladder_player_state'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const changeHostMode = (mode: SnakeLadderHostMode) => {
    setHostModeState(mode)
    setSnakeLadderHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    if (!hostJoinName.trim()) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: hostJoinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const hostRoll = async () => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    rollStartedRef.current = Date.now()
    setRolling(true)
    setDisplayRoll(null)
    playSnakeLadderRollSound()
    try {
      const res = await fetch('/api/snake-and-ladder/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      if (typeof data.roll === 'number') setDisplayRoll(data.roll)
      playSnakeLadderActionSound()
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setHostActing(false)
      const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      setRolling(false)
    }
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      success('Game started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
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
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('snake_and_ladder')
  const canStart = players.filter((p) => p.spectator !== true).length >= SNAKE_LADDER_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useSnakeLadderTurnTimer(gameCode, session, game?.status === 'active')

  useSnakeLadderNotifications({
    game,
    session,
    myPlayerId: hostPlayerId,
    players,
    enabled: hostPlays && game?.status === 'active',
  })

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Linger on the finished board for a few seconds so the winning move is visible
  // before showing the final leaderboard. Only triggers when we witnessed live
  // play (so opening an already-finished game doesn't re-hold), and survives a
  // status/winner update race via sawActiveRef. Resets on replay.
  useEffect(() => {
    const status = game?.status
    if (status === 'active') sawActiveRef.current = true
    const finishedWithWinner = status === 'finished' && !!session?.winner_player_id
    if (finishedWithWinner && sawActiveRef.current && !winHandledRef.current) {
      winHandledRef.current = true
      setHoldWin(true)
      const t = setTimeout(() => setHoldWin(false), WIN_HOLD_MS)
      return () => clearTimeout(t)
    }
    if (status !== 'finished') {
      winHandledRef.current = false
      setHoldWin(false)
      if (status === 'waiting') sawActiveRef.current = false
    }
  }, [game?.status, session?.winner_player_id])

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-2xl font-black">Game not found</p>
        <p className="text-muted">This host link is invalid or the game no longer exists.</p>
        <a href="/" className="btn-secondary px-5 py-2.5 text-sm">
          Go home
        </a>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive board when the host is playing, read-only board otherwise.
  const interactivePlay = session && hostPlayerId && (
    <SnakeLadderGamePanel
      session={session}
      states={states}
      players={players}
      myPlayerId={hostPlayerId}
      isMyTurn={isHostTurn}
      secondsLeft={secondsLeft}
      hasTimer={hasTimer}
      urgent={urgent}
      onRoll={() => void hostRoll()}
      acting={hostActing}
      rolling={rolling}
      displayRoll={displayRoll}
    />
  )

  const watchBoard = session ? (
    <SnakeLadderGamePanel
      session={session}
      states={states}
      players={players}
      myPlayerId={hostPlayerId}
      isMyTurn={false}
      secondsLeft={secondsLeft}
      hasTimer={hasTimer}
      urgent={urgent}
    />
  ) : (
    <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="snake_and_ladder"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            spectatorHint="Spectate from the Watch tab"
          />
        ) : undefined
      }
      settings={
        <>
          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="snake_and_ladder"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
          )}
          {game.status === 'active' && (
            <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          )}
        </>
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${SNAKE_LADDER_MIN_PLAYERS} players to start (${players.length}/${SNAKE_LADDER_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        holdWin && session ? (
          <>
            {/* Victory hold: keep the finished board on screen briefly before the
                leaderboard so everyone sees the winning move. */}
            <SnakeLadderCard className="p-3 text-center">
              <p className="text-lg font-black">🏆 {winner?.name ?? 'Winner'} wins!</p>
              <p className="text-xs text-muted">Final results in a moment…</p>
            </SnakeLadderCard>
            <SnakeLadderGamePanel
              session={session}
              states={states}
              players={players}
              myPlayerId={hostPlayerId}
              isMyTurn={false}
              secondsLeft={secondsLeft}
              hasTimer={hasTimer}
              urgent={urgent}
            />
          </>
        ) : (
          <SnakeLadderFinalResultsShareBlock
            game={game}
            players={players}
            states={states}
            session={session}
            winnerName={winner?.name}
            playAgainButton={
              <SnakeLadderPrimaryButton onClick={playAgain} loading={playingAgain}>
                Play again
              </SnakeLadderPrimaryButton>
            }
          />
        )
      }
    />
  )
}
