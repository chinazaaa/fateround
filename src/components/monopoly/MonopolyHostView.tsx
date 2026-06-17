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
import {
  MonopolyCashBadge,
  MonopolyGlassCard,
  MonopolyLoadingScreen,
  MonopolyModal,
  MonopolyPrimaryButton,
  MonopolySecondaryButton,
  MonopolyShell,
  MonopolyStatusBanner,
  MonopolyTurnStrip,
} from '@/components/monopoly/MonopolyChrome'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { gameTypeConfig } from '@/lib/game-types'
import {
  computeRent,
  currentPlayerId,
  getMonopolyHostMode,
  MONOPOLY_COLOR_CLASSES,
  MONOPOLY_JAIL_FINE,
  MONOPOLY_MIN_PLAYERS,
  parsePropertyOwners,
  setMonopolyHostMode,
  spaceAt,
  type MonopolyHostMode,
} from '@/lib/monopoly'
import type { MonopolyColorGroup } from '@/lib/monopoly'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  MONOPOLY_BOARD_SELECT,
  MONOPOLY_PLAYER_STATE_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
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

  // Host+play mode
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

  // Host player-specific state
  const hostState = hostPlayerId ? states.find((s) => s.player_id === hostPlayerId) : null
  const isHostTurn = turnPlayerId === hostPlayerId && !hostState?.bankrupt
  const owners = parsePropertyOwners(board?.property_owners)
  const pendingSpace = board?.pending_space != null ? spaceAt(board.pending_space) : null
  const hostCurrentOwner = hostState != null ? players.find((p) => p.id === owners[String(hostState.position)])?.name : null
  const rentOwnerId = board?.phase === 'pay_rent' && board.pending_space != null ? owners[String(board.pending_space)] : null
  const rentOwner = rentOwnerId ? players.find((p) => p.id === rentOwnerId) : null
  const rentAmount = pendingSpace && rentOwnerId ? computeRent(pendingSpace, owners, rentOwnerId, board?.last_dice?.total ?? 2) : 0
  const showBuyModal = !!(isHostTurn && board?.phase === 'buy' && pendingSpace != null)
  const showRentModal = !!(isHostTurn && board?.phase === 'pay_rent' && pendingSpace != null)
  const showJailModal = !!(isHostTurn && board?.phase === 'jail' && hostState?.in_jail)

  if (!game) return <MonopolyLoadingScreen />

  return (
    <MonopolyShell title={game.title} subtitle={`${cfg.label} · Room ${gameCode}`}>
      <CopyLinkButton
        value={joinUrl}
        label="Copy player link"
        className="w-full !rounded-2xl !border-[var(--border-strong)] !bg-[var(--card)] !text-[var(--foreground)] hover:!bg-[var(--card-hover)]"
      />

      {/* Host mode selector — lobby only */}
      {game.status === 'waiting' && (
        <MonopolyGlassCard className="p-5 space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-faint font-semibold">Host mode</p>
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
              <span className="font-bold block text-sm text-[var(--foreground)]">Host only</span>
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
              <span className="font-bold block text-sm text-[var(--foreground)]">Host + play</span>
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
              Playing as <strong className="text-[var(--foreground)]">{hostPlayerName}</strong> — switch to Play after the game starts.
            </p>
          )}
        </MonopolyGlassCard>
      )}

      {/* Play / Manage tab switcher */}
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

      {/* Play tab — host as Monopoly player */}
      {tab === 'play' && hostPlays && hostPlayerId && game.status === 'active' && board && (
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

          {board.status_message && !showBuyModal && !showRentModal && (
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
                    className="rounded-xl bg-gradient-to-b from-[var(--marry)] to-[color-mix(in_srgb,var(--marry)_75%,#000)] px-4 py-2 text-xs font-black text-[var(--background)] shadow-md disabled:opacity-50"
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

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-faint mb-2 px-1">All players</p>
            <MonopolyPlayerList
              states={states}
              players={players}
              currentPlayerId={turnPlayerId}
              propertyOwners={owners}
              myPlayerId={hostPlayerId}
            />
          </div>

          {/* Buy property modal */}
          <MonopolyModal
            open={showBuyModal}
            subtitle="Property available"
            title={pendingSpace?.name ?? ''}
            colorBar={pendingSpace?.color ? colorBarClass(pendingSpace.color) : undefined}
          >
            <p className="text-center text-3xl font-black text-[var(--marry)]">${pendingSpace?.price}</p>
            {pendingSpace?.rent != null && (
              <p className="text-center text-sm text-muted">Rent ${pendingSpace.rent}</p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <MonopolyPrimaryButton
                onClick={() => postHostAction('/api/monopoly/buy', { buy: true })}
                loading={hostActing}
                disabled={(hostState?.cash ?? 0) < (pendingSpace?.price ?? 0)}
              >
                Buy
              </MonopolyPrimaryButton>
              <MonopolySecondaryButton
                onClick={() => postHostAction('/api/monopoly/buy', { buy: false })}
                disabled={hostActing}
              >
                Pass
              </MonopolySecondaryButton>
            </div>
          </MonopolyModal>

          {/* Pay rent modal */}
          <MonopolyModal
            open={showRentModal}
            subtitle="Rent due"
            title={pendingSpace?.name ?? ''}
            colorBar={pendingSpace?.color ? colorBarClass(pendingSpace.color) : undefined}
          >
            <p className="text-center text-sm text-muted">
              Owned by <span className="font-bold text-[var(--foreground)]">{rentOwner?.name ?? 'another player'}</span>
            </p>
            <p className="text-center text-3xl font-black text-red-500">${rentAmount}</p>
            <MonopolyPrimaryButton
              onClick={() => postHostAction('/api/monopoly/rent')}
              loading={hostActing}
              disabled={(hostState?.cash ?? 0) < rentAmount}
            >
              Pay ${rentAmount}
            </MonopolyPrimaryButton>
          </MonopolyModal>

          {/* Jail modal */}
          <MonopolyModal open={showJailModal} subtitle="In jail" title="🔒 Roll, pay, or use a card">
            <div className="space-y-2">
              <MonopolyPrimaryButton onClick={() => postHostAction('/api/monopoly/roll')} loading={hostActing}>
                Roll for doubles
              </MonopolyPrimaryButton>
              <MonopolySecondaryButton
                onClick={() => postHostAction('/api/monopoly/jail', { method: 'pay' })}
                disabled={hostActing || (hostState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
              >
                Pay ${MONOPOLY_JAIL_FINE} fine
              </MonopolySecondaryButton>
              {(hostState?.get_out_of_jail_free ?? 0) > 0 && (
                <MonopolySecondaryButton
                  onClick={() => postHostAction('/api/monopoly/jail', { method: 'card' })}
                  disabled={hostActing}
                >
                  Use Get Out of Jail Free card
                </MonopolySecondaryButton>
              )}
            </div>
          </MonopolyModal>
        </>
      )}

      {/* Manage tab (or default when no Play tab) */}
      {(tab === 'manage' || !showPlayTab) && (
        <>
          {game.status === 'waiting' && (
            <>
              <MonopolyGlassCard className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-faint">Lobby</p>
                    <p className="text-2xl font-black text-[var(--foreground)]">
                      {players.length} <span className="text-lg font-semibold text-muted">/ 6 players</span>
                    </p>
                  </div>
                  <div className="text-4xl">🎩</div>
                </div>
                <div className="space-y-2">
                  {players.length === 0 ? (
                    <p className="text-sm text-faint text-center py-4">Waiting for players to join…</p>
                  ) : (
                    players.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl bg-[var(--surface-inset-bg)] px-3 py-2.5 border border-[var(--border-strong)]"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_25%,transparent)] text-sm font-bold text-[var(--foreground)]">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-semibold text-[var(--foreground)]">{p.name}</span>
                        {p.id === hostPlayerId && (
                          <span className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {!canStart && (
                  <p className="text-sm text-[var(--marry)] text-center">
                    Need at least {MONOPOLY_MIN_PLAYERS} players to start
                  </p>
                )}
              </MonopolyGlassCard>
              <MonopolyPrimaryButton onClick={startGame} disabled={!canStart} loading={starting} variant="gold">
                Start Monopoly
              </MonopolyPrimaryButton>
            </>
          )}

          {game.status === 'active' && board && (
            <>
              <MonopolyTurnStrip turnName={turnPlayer?.name ?? '—'} phase={board.phase} />
              {board.status_message && <MonopolyStatusBanner message={board.status_message} />}
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
              <MonopolyPlayerList
                states={states}
                players={players}
                currentPlayerId={turnPlayerId}
                propertyOwners={board.property_owners}
              />
              <HostEndGameButton
                gameCode={gameCode}
                hostToken={hostToken}
                onEnded={load}
                label="End game early"
                className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] px-5 py-3.5 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] disabled:opacity-40 transition-colors"
              />
            </>
          )}

          {game.status === 'finished' && (
            <>
              <MonopolyGlassCard glow="accent" className="py-10 text-center">
                <div className="text-6xl mb-3">🏆</div>
                <p className="text-2xl font-black text-[var(--marry)]">{winner ? `${winner.name} wins!` : 'Game over'}</p>
              </MonopolyGlassCard>
              <MonopolyPlayerList
                states={states}
                players={players}
                propertyOwners={board?.property_owners}
              />
              <MonopolyPrimaryButton onClick={playAgain} loading={playingAgain} variant="gold">
                Play again
              </MonopolyPrimaryButton>
              <CreateNewGameButton className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] px-5 py-3.5 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors" />
            </>
          )}
        </>
      )}
    </MonopolyShell>
  )
}
