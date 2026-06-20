'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { InviteLinkActions } from '@/components/InviteLinkActions'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getLudoHostMode,
  LUDO_MIN_PLAYERS,
  parseLudoDice,
  setLudoHostMode,
  type LudoHostMode,
} from '@/lib/ludo'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, LudoDiceRoll, LudoPlayerState, LudoSession, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useLudoTurnTimer } from '@/hooks/useLudoTurnTimer'
import { useLudoNotifications, playLudoActionSound, playLudoRollSound } from '@/hooks/useLudoNotifications'
import { LudoGamePanel } from '@/components/ludo/LudoBoard'
import { LudoFinalResultsShareBlock } from '@/components/ludo/LudoFinalResultsShareBlock'
import { LudoPrimaryButton } from '@/components/ludo/LudoChrome'
import { SoundToggle } from '@/components/SoundToggle'

const ROLL_MIN_MS = 700

type HostTab = 'play' | 'manage'

export function LudoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)
  const [hostMode, setHostModeState] = useState<LudoHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<LudoDiceRoll | null>(null)
  const rollStartedRef = useRef(0)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, statesRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('ludo_player_state').select(LUDO_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, statesRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as LudoSession | null)
    setStates((statesRes.data as LudoPlayerState[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getLudoHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (hostMode === 'player' && hostPlayerId && game?.status === 'active') {
      setTab('play')
    }
  }, [hostMode, hostPlayerId, game?.status])

  // Coalesce the burst of postgres_changes events a single move produces into
  // one reload, avoiding refetch storms and flicker from partial snapshots.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`ludo-host-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_sessions', filter: `game_id=eq.${gameCode}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_player_state', filter: `game_id=eq.${gameCode}` }, scheduleLoad)
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

  const changeHostMode = (mode: LudoHostMode) => {
    setHostModeState(mode)
    setLudoHostMode(gameCode, mode)
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
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const postHostAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId) return
    setHostActing(true)
    if (path.includes('/roll')) {
      rollStartedRef.current = Date.now()
      setRolling(true)
      setDisplayDice(null)
      playLudoRollSound()
    }
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      if (data.dice) setDisplayDice(parseLudoDice(data.dice))
      if (path.includes('/roll') || path.includes('/move')) playLudoActionSound()
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setHostActing(false)
      if (path.includes('/roll')) {
        const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
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
        body: JSON.stringify({ hostToken }),
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

  const cfg = gameTypeConfig('ludo')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= LUDO_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && game?.status !== 'waiting' && game?.status !== 'finished'
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useLudoTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && (tab === 'play' ? isHostTurn : true)
  )

  useLudoNotifications({
    game,
    session,
    myPlayerId: hostPlayerId,
    players,
    enabled: hostPlays && game?.status === 'active',
  })

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host panel</p>
        </div>

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

        {tab === 'play' && session && hostPlayerId && (
          <LudoGamePanel
            session={session}
            states={states}
            players={players}
            myPlayerId={hostPlayerId}
            isMyTurn={isHostTurn}
            secondsLeft={secondsLeft}
            hasTimer={hasTimer}
            urgent={urgent}
            onRoll={() => void postHostAction('/api/ludo/roll')}
            onMovePiece={(pieceId, diceIndex) =>
              void postHostAction('/api/ludo/move', { pieceId, diceIndex })
            }
            acting={hostActing}
            rolling={rolling}
            displayDice={displayDice}
          />
        )}

        {(tab === 'manage' || !showPlayTab) && (
          <>
            <div className="glass-card-strong p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="label-caps">Share link</p>
                <InviteLinkActions url={joinUrl} copyLabel="Copy player link" successMessage="Player link copied" />
              </div>
              <p className="text-xs text-muted break-all">{joinUrl}</p>
            </div>

            {game.status === 'waiting' && (
              <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
            )}

            <p className="text-center">
              <GameRulesLink gameType="ludo" variant="subtle" />
            </p>

            {session && (
              <LudoGamePanel
                session={session}
                states={states}
                players={players}
                myPlayerId={hostPlayerId}
                isMyTurn={false}
                secondsLeft={secondsLeft}
                hasTimer={hasTimer}
                urgent={urgent}
              />
            )}

            {(game.status === 'waiting' || game.status === 'active') && (
              <div className="glass-card p-4 space-y-3">
                <p className="label-caps">Players — {players.length}</p>
                <HostPlayerManageList
                  players={players}
                  removingPlayerId={removingPlayerId}
                  onRemovePlayer={removePlayer}
                  highlightPlayerId={hostPlayerId}
                />
              </div>
            )}

            {game.status === 'waiting' && (
              <>
                <LudoPrimaryButton onClick={startGame} disabled={!canStart} loading={starting}>
                  {canStart ? 'Start game' : `Need at least ${LUDO_MIN_PLAYERS} players`}
                </LudoPrimaryButton>
                <HostEndGameButton
                  gameCode={gameCode}
                  hostToken={hostToken}
                  onEnded={load}
                  label="End lobby"
                  confirmTitle="Close this lobby?"
                  confirmMessage="Players will be disconnected. You can start a new game from Play again afterward."
                  className="btn-secondary w-full py-3"
                />
              </>
            )}

            {game.status === 'active' && (
              <button type="button" onClick={endGame} disabled={ending} className="btn-secondary w-full py-3">
                {ending ? 'Ending…' : 'End game early'}
              </button>
            )}

            {game.status === 'finished' && (
              <>
                <LudoFinalResultsShareBlock
                  game={game}
                  players={players}
                  states={states}
                  session={session}
                  winnerName={winner?.name}
                  playAgainButton={
                    <LudoPrimaryButton onClick={playAgain} loading={playingAgain}>
                      Play again
                    </LudoPrimaryButton>
                  }
                />
              </>
            )}
          </>
        )}
      </div>
      <SoundToggle />
    </div>
  )
}
