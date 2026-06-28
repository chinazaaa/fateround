'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { currentTurnPlayerId, TIC_TAC_TOE_MIN_PLAYERS, isTicTacToeResultsPhase } from '@/lib/tic-tac-toe'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, TIC_TAC_TOE_SESSION_SELECT } from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, TicTacToeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useTicTacToeTurnTimer } from '@/hooks/useTicTacToeTurnTimer'
import { TicTacToeGamePanel } from '@/components/tic-tac-toe/TicTacToeBoard'
import { TicTacToeFinalResultsShareBlock } from '@/components/tic-tac-toe/TicTacToeFinalResultsShareBlock'
import { TicTacToePrimaryButton } from '@/components/tic-tac-toe/TicTacToeChrome'

type HostTab = 'play' | 'manage'
type TicTacToeHostMode = 'spectator' | 'player'

const HOST_MODE_KEY = 'tic_tac_toe_host_mode'

function getHostMode(gameCode: string): TicTacToeHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as TicTacToeHostMode) ?? 'spectator'
}

function setHostMode(gameCode: string, mode: TicTacToeHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

export function TicTacToeHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<TicTacToeSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)
  const [hostMode, setHostModeState] = useState<TicTacToeHostMode>('spectator')
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
      .from('tic_tac_toe_sessions')
      .select(TIC_TAC_TOE_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    if (supabasePollOk(sessionRes)) {
      setSession(sessionRes.data as TicTacToeSession | null)
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

  useEffect(() => {
    if (isTicTacToeResultsPhase(game?.status, session)) setTab('manage')
  }, [game?.status, session])

  useEffect(() => {
    if (hostMode === 'player' && hostPlayerId && game?.status === 'active') {
      setTab('play')
    }
  }, [hostMode, hostPlayerId, game?.status])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`tic-tac-toe-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        scheduleLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tic_tac_toe_sessions', filter: `game_id=eq.${gameCode}` },
        scheduleLoad
      )
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

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

  const changeHostMode = (mode: TicTacToeHostMode) => {
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

  const movePiece = async (cellIndex: number) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch('/api/tic-tac-toe/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, cellIndex }),
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

  const endGame = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end')
      success('Game ended')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end')
    } finally {
      setEnding(false)
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
  const canStart = readyPlayers.length >= TIC_TAC_TOE_MIN_PLAYERS
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const gameFinished = isTicTacToeResultsPhase(game?.status, session)
  const showPlayTab = hostPlays && game?.status !== 'waiting' && !gameFinished
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useTicTacToeTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && (tab === 'play' ? isHostTurn : true)
  )

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

  const layout = hostPlayLayoutFlags(tab, showPlayTab, game.status)

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      {!gameFinished && <HostGameHeader game={game} />}

      {game.status === 'waiting' && (
        <div className="glass-card-strong p-5 space-y-3">
          <p className="label-caps">Host mode</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => changeHostMode('spectator')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'spectator'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host only</span>
              <span className="text-faint text-xs">Spectate from Manage</span>
            </button>
            <button
              type="button"
              onClick={() => changeHostMode('player')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'player'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host + play</span>
              <span className="text-faint text-xs">Play tab + Manage tab</span>
            </button>
          </div>
          {hostMode === 'player' && !hostPlayerId && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={hostJoinName}
                onChange={(e) => setHostJoinName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void hostJoinGame()}
                placeholder="Your name"
                className="input-field flex-1"
                maxLength={40}
              />
              <button
                type="button"
                onClick={() => void hostJoinGame()}
                disabled={!hostJoinName.trim() || hostJoining}
                className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
              >
                {hostJoining ? 'Joining…' : 'Join'}
              </button>
            </div>
          )}
          {hostMode === 'player' && hostPlayerId && (
            <p className="text-sm text-muted">
              Playing as <span className="font-semibold text-[var(--foreground)]">{hostPlayerName}</span>
            </p>
          )}
        </div>
      )}

      {showPlayTab && (
        <div className="flex rounded-xl border border-[var(--border-strong)] p-1 bg-[var(--surface-inset-bg)]">
          <button
            type="button"
            onClick={() => setTab('play')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'play' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'manage' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
          >
            Manage
          </button>
        </div>
      )}

      {tab === 'play' && session && hostPlayerId && game.status === 'active' && !gameFinished && (
        <TicTacToeGamePanel
          session={session}
          players={players}
          myPlayerId={hostPlayerId}
          isMyTurn={isHostTurn}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          onMove={(cellIndex) => void movePiece(cellIndex)}
          acting={hostActing}
        />
      )}

      {(tab === 'manage' || !showPlayTab) && (
        <>
          {!gameFinished && (
            <p className="text-center">
              <GameRulesLink gameType="tic_tac_toe" variant="subtle" />
            </p>
          )}

          {gameFinished && (
            <TicTacToeFinalResultsShareBlock
              game={game}
              players={players}
              session={session}
              winnerName={winner?.name}
              highlightPlayerId={hostPlayerId}
              playAgainButton={
                <TicTacToePrimaryButton onClick={playAgain} loading={playingAgain}>
                  Play again
                </TicTacToePrimaryButton>
              }
            />
          )}

          {session && game.status === 'active' && !gameFinished && (
            <TicTacToeGamePanel
              session={session}
              players={players}
              myPlayerId={hostPlayerId}
              isMyTurn={false}
              secondsLeft={secondsLeft}
              hasTimer={hasTimer}
              urgent={urgent}
            />
          )}

          {(game.status === 'waiting' || (game.status === 'active' && !gameFinished)) && (
            <HostLobbyPlayersSection
              players={players}
              removingPlayerId={removingPlayerId}
              onRemovePlayer={removePlayer}
              highlightPlayerId={hostPlayerId}
            />
          )}

          {game.status === 'waiting' && (
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
                    ? `Waiting for players to tap ready (${readyPlayers.length}/${TIC_TAC_TOE_MIN_PLAYERS})`
                    : `Need exactly ${TIC_TAC_TOE_MIN_PLAYERS} players to start (${players.length}/${TIC_TAC_TOE_MIN_PLAYERS})`
              }
              className="space-y-3"
            />
          )}

          {game.status === 'active' && !gameFinished && (
            <button type="button" onClick={endGame} disabled={ending} className="btn-secondary w-full py-3">
              {ending ? 'Ending…' : 'End game early'}
            </button>
          )}
        </>
      )}
    </HostPageShell>
  )
}
