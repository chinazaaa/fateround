'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MonopolyClassicBoard,
  MonopolyCurrentSpace,
  MonopolyDiceRoll,
  MonopolyMyProperties,
  MonopolyPlayerList,
} from '@/components/monopoly/MonopolyBoard'
import { MonopolyManagePanel, MonopolyTurnModals } from '@/components/monopoly/MonopolyGamePanels'
import {
  MonopolyCashBadge,
  MonopolyStatusBanner,
  MonopolyTurnStrip,
} from '@/components/monopoly/MonopolyChrome'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getMonopolyHostMode,
  MONOPOLY_COLOR_CLASSES,
  MONOPOLY_MIN_PLAYERS,
  parsePropertyOwners,
  setMonopolyHostMode,
  type MonopolyColorGroup,
  type MonopolyHostMode,
} from '@/lib/monopoly'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  MONOPOLY_BOARD_SELECT,
  MONOPOLY_PLAYER_STATE_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'

type HostTab = 'play' | 'manage'

function colorBarClass(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-500'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-500'
}

export function MonopolyHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [board, setBoard] = useState<MonopolyBoard | null>(null)
  const [states, setStates] = useState<MonopolyPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)

  const [hostMode, setHostMode] = useState<MonopolyHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, boardRes, stateRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('monopoly_player_state').select(MONOPOLY_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, boardRes, stateRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setBoard(boardRes.data as MonopolyBoard | null)
    setStates((stateRes.data as MonopolyPlayerState[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getMonopolyHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    const channel = supabase
      .channel(`monopoly-host-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monopoly_boards', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monopoly_player_state', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      setStates((prev) => prev.filter((s) => s.player_id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const playerManageBlock =
    game && (game.status === 'waiting' || game.status === 'active') ? (
      <div className="glass-card p-4 space-y-3">
        <p className="label-caps">Players — {players.length}</p>
        <HostPlayerManageList
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
        />
      </div>
    ) : null

  const changeHostMode = (mode: MonopolyHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setMonopolyHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
      setHostPlayerId(data.playerId)
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setMonopolyHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const postHostAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || hostActing) return
    setHostActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
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
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const finishGame = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end game')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end game')
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

  const cfg = gameTypeConfig('monopoly')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.length >= MONOPOLY_MIN_PLAYERS
  const turnPlayerId = board ? currentPlayerId(board) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === board?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && game?.status !== 'waiting' && game?.status !== 'finished'

  const hostState = hostPlayerId ? states.find((s) => s.player_id === hostPlayerId) : null
  const isHostTurn = turnPlayerId === hostPlayerId && !hostState?.bankrupt
  const owners = parsePropertyOwners(board?.property_owners)
  const hostCurrentOwner = hostState != null ? players.find((p) => p.id === owners[String(hostState.position)])?.name : null

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
                  onKeyDown={(e) => e.key === 'Enter' && hostJoinGame()}
                  placeholder="Your name"
                  className="input-field flex-1"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={hostJoinGame}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  {hostJoining ? 'Joining…' : 'Join'}
                </button>
              </div>
            )}
            {hostMode === 'player' && hostPlayerId && (
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — switch to Play after you start.
              </p>
            )}
          </div>
        )}

        {showPlayTab && (
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]">
            <button
              type="button"
              onClick={() => setTab('play')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'play' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'manage' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Manage
            </button>
          </div>
        )}

        {tab === 'play' && hostPlays && hostPlayerId && game.status === 'active' && (
          board ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <MonopolyTurnStrip
                turnName={turnPlayer?.name ?? '—'}
                isMyTurn={isHostTurn}
                phase={board.phase}
                myName={hostPlayerName}
              />
              {hostState && <MonopolyCashBadge amount={hostState.cash} />}
            </div>

            {board.status_message && board.phase !== 'buy' && board.phase !== 'pay_rent' && board.phase !== 'auction' && (
              <MonopolyStatusBanner message={board.status_message} isMyTurn={isHostTurn} />
            )}

            <MonopolyClassicBoard
              states={states}
              players={players}
              propertyOwners={owners}
              highlightIndex={hostState?.position}
              center={
                <div className="flex flex-col items-center justify-center h-full gap-2 px-1">
                  <MonopolyDiceRoll dice={board.last_dice} rolling={hostActing} />
                  {isHostTurn && board.phase === 'roll' && !hostState?.in_jail && (
                    <button
                      type="button"
                      disabled={hostActing}
                      onClick={() => postHostAction('/api/monopoly/roll')}
                      className="btn-primary btn-fit px-4 py-2 text-xs"
                    >
                      {hostActing ? '…' : '🎲 Roll'}
                    </button>
                  )}
                </div>
              }
            />

            {hostState && (
              <MonopolyCurrentSpace index={hostState.position} ownerName={hostCurrentOwner} />
            )}

            <MonopolyMyProperties
              playerId={hostPlayerId}
              propertyOwners={owners}
              players={players}
            />

            <MonopolyManagePanel
              board={board}
              myPlayerId={hostPlayerId}
              myState={hostState ?? undefined}
              players={players}
              acting={hostActing}
              postAction={postHostAction}
            />

            <MonopolyPlayerList
              states={states}
              players={players}
              currentPlayerId={turnPlayerId}
              propertyOwners={owners}
              myPlayerId={hostPlayerId}
            />

            <MonopolyTurnModals
              board={board}
              myPlayerId={hostPlayerId}
              myState={hostState ?? undefined}
              players={players}
              acting={hostActing}
              postAction={postHostAction}
              colorBarClass={colorBarClass}
            />
          </>
          ) : (
            <div className="glass-card p-8 text-center text-sm text-muted">Loading board…</div>
          )
        )}

        {(tab === 'manage' || !showPlayTab) && (
          <>
            <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-faint text-xs uppercase tracking-wider">Share with players</p>
                <p className="font-mono font-bold text-lg">{gameCode}</p>
              </div>
              <CopyLinkButton value={joinUrl} label="Copy player link" />
            </div>

            {game.status === 'waiting' && (
              <>
                {playerManageBlock}
                <div className="glass-card p-5 space-y-4">
                  {!canStart && (
                    <p className="text-sm text-[var(--marry)]">
                      Need at least {MONOPOLY_MIN_PLAYERS} players to start.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={startGame}
                    disabled={!canStart || starting}
                    className="btn-primary w-full"
                  >
                    {starting ? 'Starting…' : `Start Monopoly (${MONOPOLY_MIN_PLAYERS}+ players)`}
                  </button>
                </div>
              </>
            )}

            {game.status === 'active' && board && (
              <>
                {playerManageBlock}
                <div className="glass-card p-4 space-y-3">
                  <p className="label-caps">Live board (host view)</p>
                  <p className="text-sm text-muted text-center">
                    {turnPlayer ? (
                      <>
                        <strong className="text-body">{turnPlayer.name}</strong>
                        {' · '}
                        <span className="capitalize">{board.phase.replace('_', ' ')}</span>
                      </>
                    ) : (
                      'Waiting for turn…'
                    )}
                  </p>
                  {board.status_message && (
                    <p className="text-sm text-muted text-center leading-relaxed">{board.status_message}</p>
                  )}
                  <MonopolyClassicBoard
                    states={states}
                    players={players}
                    propertyOwners={board.property_owners}
                    center={
                      <div className="flex flex-col items-center justify-center h-full gap-1">
                        <MonopolyDiceRoll dice={board.last_dice} />
                        <p className="text-[10px] uppercase tracking-widest text-faint mt-1">Host view</p>
                      </div>
                    }
                  />
                </div>
                <MonopolyPlayerList
                  states={states}
                  players={players}
                  currentPlayerId={turnPlayerId}
                  propertyOwners={board.property_owners}
                />
                <button
                  type="button"
                  onClick={finishGame}
                  disabled={ending}
                  className="btn-secondary w-full py-3"
                >
                  {ending ? 'Ending…' : 'End game early'}
                </button>
              </>
            )}

            {game.status === 'finished' && (
              <>
                <div className="glass-card p-8 text-center space-y-3">
                  <p className="text-4xl">🏆</p>
                  <p className="text-xl font-black gradient-title">
                    {winner ? `${winner.name} wins!` : 'Game over'}
                  </p>
                </div>
                <MonopolyPlayerList
                  states={states}
                  players={players}
                  propertyOwners={board?.property_owners}
                />
                <button
                  type="button"
                  onClick={playAgain}
                  disabled={playingAgain}
                  className="btn-secondary w-full py-3"
                >
                  {playingAgain ? 'Resetting…' : 'Play again'}
                </button>
                <CreateNewGameButton className="btn-ghost w-full text-muted" />
              </>
            )}
          </>
        )}

        <button type="button" onClick={() => router.push('/')} className="btn-ghost w-full text-muted">
          Back home
        </button>
      </div>
    </div>
  )
}
