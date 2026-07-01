'use client'

import { useCallback, useEffect, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { currentTurnPlayerId, CHECKERS_MIN_PLAYERS, isCheckersResultsPhase } from '@/lib/checkers'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, CHECKERS_SESSION_SELECT } from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, CheckersSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useCheckersClockExpiry } from '@/hooks/useCheckersClocks'
import { CheckersGamePanel } from '@/components/checkers/CheckersBoard'
import { CheckersFinalResultsShareBlock } from '@/components/checkers/CheckersFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { CheckersPrimaryButton } from '@/components/checkers/CheckersChrome'

type HostTab = 'play' | 'manage'
type CheckersHostMode = 'spectator' | 'player'

const HOST_MODE_KEY = 'checkers_host_mode'

function getHostMode(gameCode: string): CheckersHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as CheckersHostMode) ?? 'spectator'
}

function setHostMode(gameCode: string, mode: CheckersHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

export function CheckersHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<CheckersSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostModeState] = useState<CheckersHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [loading, setLoading] = useState(true)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false

    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setLoading(false)

    const sessionRes = await supabase
      .from('checkers_sessions')
      .select(CHECKERS_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    if (supabasePollOk(sessionRes)) {
      setSession(sessionRes.data as CheckersSession | null)
    }
    return supabasePollOk(sessionRes)
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage at results.
  useEffect(() => {
    if (isCheckersResultsPhase(game?.status, session)) setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status, session])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'checkers_sessions'], load)

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

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const changeHostMode = (mode: CheckersHostMode) => {
    setHostModeState(mode)
    setHostMode(gameCode, mode)
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

  const movePiece = async (from: string, to: string) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch('/api/checkers/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, from, to }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Move failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setHostActing(false)
    }
  }

  const resign = async () => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const ok = await confirm({
      title: 'Resign this game?',
      message: 'Your opponent will be awarded the win.',
      confirmLabel: 'Resign',
      destructive: true,
    })
    if (!ok) return
    setHostActing(true)
    try {
      const res = await fetch('/api/checkers/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to resign')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to resign')
    } finally {
      setHostActing(false)
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
      if (data.game) setGame(data.game)
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length >= CHECKERS_MIN_PLAYERS
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const gameFinished = isCheckersResultsPhase(game?.status, session)
  const isHostTurn = turnPlayerId === hostPlayerId

  useCheckersClockExpiry(gameCode, session, game?.status === 'active')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
      </div>
    )
  }

  const showTabs = !gameFinished
  const gameStarted = game.status === 'active' && !gameFinished
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = session && hostPlayerId && (
    <div className="max-w-lg mx-auto w-full">
      <CheckersGamePanel
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        isMyTurn={isHostTurn}
        timeControlSeconds={game?.timer_seconds ?? 0}
        onMove={movePiece}
        onResign={resign}
        acting={hostActing}
      />
    </div>
  )

  const watchBoard = session ? (
    <div className="max-w-lg mx-auto w-full">
      <CheckersGamePanel
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        isMyTurn={false}
        timeControlSeconds={game?.timer_seconds ?? 0}
      />
    </div>
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
      gameType="checkers"
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
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={startGame}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={
              canStart
                ? null
                : readyPlayers.length < players.length
                  ? `Waiting for players to tap ready (${readyPlayers.length}/${CHECKERS_MIN_PLAYERS})`
                  : `Need exactly ${CHECKERS_MIN_PLAYERS} players to start (${players.length}/${CHECKERS_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' && !gameFinished ? (
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
      status={gameFinished ? 'finished' : game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={gameFinished ? undefined : <HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <>
          <CheckersFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={hostPlayerId}
            playAgainButton={
              <CheckersPrimaryButton onClick={playAgain} loading={playingAgain}>
                Play again
              </CheckersPrimaryButton>
            }
          />
          {hostPlayerId && session?.winner_player_id === hostPlayerId && (
            <PostWinToCommunity
              gameType="checkers"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={session?.id}
            />
          )}
        </>
      }
    />
  )
}
