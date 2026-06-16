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
import { MONOPOLY_COLOR_CLASSES } from '@/lib/monopoly'
import type { MonopolyColorGroup } from '@/lib/monopoly'
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
import { gameTypeConfig } from '@/lib/game-types'
import {
  computeRent,
  currentPlayerId,
  MONOPOLY_JAIL_FINE,
  MONOPOLY_MIN_PLAYERS,
  parsePropertyOwners,
  spaceAt,
} from '@/lib/monopoly'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  MONOPOLY_BOARD_SELECT,
  MONOPOLY_PLAYER_STATE_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { preJoinScreen } from '@/lib/viewers'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'waiting' | 'active' | 'finished' | 'not_found'

function colorBarClass(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-500'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-500'
}

export function MonopolyPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [board, setBoard] = useState<MonopolyBoard | null>(null)
  const [states, setStates] = useState<MonopolyPlayerState[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)

  useApplyGameTheme(game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      setScreen('join')
      return
    }
    if (gameData.status === 'waiting') {
      setScreen(playerId ? 'waiting' : 'join')
      return
    }
    if (gameData.status === 'active') {
      setScreen(playerId ? 'active' : 'join')
      return
    }
    setScreen(playerId ? 'finished' : 'join')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, boardRes, stateRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('monopoly_player_state').select(MONOPOLY_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, boardRes, stateRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setBoard(boardRes.data as MonopolyBoard | null)
    setStates((stateRes.data as MonopolyPlayerState[]) ?? [])

    const session = getPlayerSession(gameCode)
    let playerId = session?.playerId ?? null
    if (session && plrs && !plrs.some((p) => p.id === session.playerId)) {
      clearPlayerSession(gameCode)
      playerId = null
      setMyPlayerId(null)
      setMyPlayerName(null)
    } else if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    }
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`monopoly-player-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () =>
        void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monopoly_boards', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monopoly_player_state', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = async () => {
    if (!joinName.trim()) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: joinName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both')
      setMyPlayerId(data.playerId)
      setMyPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const cfg = gameTypeConfig('monopoly')
  const myState = states.find((s) => s.player_id === myPlayerId)
  const turnPlayerId = board ? currentPlayerId(board) : null
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const pendingSpace = board?.pending_space != null ? spaceAt(board.pending_space) : null
  const owners = parsePropertyOwners(board?.property_owners)
  const currentOwner =
    myState != null ? players.find((p) => p.id === owners[String(myState.position)])?.name : null

  const rentOwnerId =
    board?.phase === 'pay_rent' && board.pending_space != null
      ? owners[String(board.pending_space)]
      : null
  const rentOwner = rentOwnerId ? players.find((p) => p.id === rentOwnerId) : null
  const rentAmount =
    pendingSpace && rentOwnerId
      ? computeRent(pendingSpace, owners, rentOwnerId, board?.last_dice?.total ?? 2)
      : 0

  const showBuyModal = !!(isMyTurn && board?.phase === 'buy' && pendingSpace != null)
  const showRentModal = !!(isMyTurn && board?.phase === 'pay_rent' && pendingSpace != null)
  const showJailModal = !!(isMyTurn && board?.phase === 'jail' && myState?.in_jail)

  if (screen === 'loading') return <MonopolyLoadingScreen />

  if (screen === 'game_started_waiting') {
    return (
      <GameStartedWaiting
        gameCode={gameCode}
        game={game}
        onLobbyOpen={openLobbyJoin}
      />
    )
  }

  if (screen === 'not_found') {
    return (
      <MonopolyShell title="Game not found">
        <MonopolyPrimaryButton onClick={() => router.push('/')}>Back home</MonopolyPrimaryButton>
      </MonopolyShell>
    )
  }

  if (screen === 'join') {
    return (
      <MonopolyShell title={game?.title ?? cfg.label} subtitle="Enter your name to take a seat at the table">
        <MonopolyGlassCard glow="primary" className="p-6 sm:p-8 space-y-5 max-w-md mx-auto">
          <div className="text-center">
            <div className="text-5xl mb-3">🎲</div>
            <p className="text-sm text-muted">2–6 players · $1,500 starting cash</p>
          </div>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <MonopolyPrimaryButton onClick={() => void join()} disabled={!joinName.trim()} loading={joining}>
            Take my seat
          </MonopolyPrimaryButton>
        </MonopolyGlassCard>
        <ShareGameLinkCard gameCode={gameCode} className="max-w-md mx-auto" />
      </MonopolyShell>
    )
  }

  if (screen === 'waiting') {
    return (
      <MonopolyShell title={game?.title} subtitle="The host will start the game when everyone is ready">
        <MonopolyGlassCard className="p-4 text-center">
          <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
          <p className="text-sm text-muted">
            player{players.length === 1 ? '' : 's'} joined · need {MONOPOLY_MIN_PLAYERS}+
          </p>
        </MonopolyGlassCard>
        <div className="space-y-2">
          {players.map((p) => (
            <MonopolyGlassCard key={p.id} className="px-4 py-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_25%,transparent)] text-sm font-bold text-[var(--foreground)]">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-semibold text-[var(--foreground)]">{p.name}</span>
              {p.id === myPlayerId && (
                <span className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
              )}
            </MonopolyGlassCard>
          ))}
        </div>
        <ShareGameLinkCard gameCode={gameCode} />
      </MonopolyShell>
    )
  }

  if (screen === 'finished') {
    const winner = players.find((p) => p.id === board?.winner_player_id)
    return (
      <MonopolyShell title="Game over!" subtitle={winner ? `${winner.name} takes the crown` : undefined}>
        <MonopolyGlassCard glow="accent" className="py-10 text-center">
          <div className="text-6xl mb-3 drop-shadow-lg">🏆</div>
          {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          <p className="text-sm text-muted mt-1">Monopoly champion</p>
        </MonopolyGlassCard>
        <MonopolyPlayerList
          states={states}
          players={players}
          propertyOwners={board?.property_owners}
          myPlayerId={myPlayerId}
        />
        <MonopolySecondaryButton onClick={() => router.push('/')}>Back home</MonopolySecondaryButton>
      </MonopolyShell>
    )
  }

  return (
    <MonopolyShell title={game?.title}>
      <div className="flex items-start justify-between gap-3">
        <MonopolyTurnStrip
          turnName={turnPlayer?.name ?? '—'}
          isMyTurn={isMyTurn}
          phase={board?.phase}
          myName={myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name}
        />
        {myState && <MonopolyCashBadge amount={myState.cash} />}
      </div>

      {board?.status_message && !showBuyModal && !showRentModal && (
        <MonopolyStatusBanner message={board.status_message} isMyTurn={isMyTurn} />
      )}

      <MonopolyClassicBoard
        states={states}
        players={players}
        propertyOwners={owners}
        highlightIndex={myState?.position}
        center={
          <div className="flex flex-col items-center justify-center h-full gap-2 px-1">
            <MonopolyDiceRoll dice={board?.last_dice} rolling={acting} />
            {isMyTurn && board?.phase === 'roll' && !myState?.in_jail && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/roll')}
                className="rounded-xl bg-gradient-to-b from-[var(--marry)] to-[color-mix(in_srgb,var(--marry)_75%,#000)] px-4 py-2 text-xs font-black text-[var(--background)] shadow-md disabled:opacity-50"
              >
                {acting ? '…' : '🎲 Roll'}
              </button>
            )}
          </div>
        }
      />

      {myState && (
        <MonopolyCurrentSpace index={myState.position} ownerName={currentOwner} />
      )}

      {myPlayerId && (
        <MonopolyMyProperties
          playerId={myPlayerId}
          propertyOwners={owners}
          players={players}
        />
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint mb-2 px-1">
          All players
        </p>
        <MonopolyPlayerList
          states={states}
          players={players}
          currentPlayerId={turnPlayerId}
          propertyOwners={owners}
          myPlayerId={myPlayerId}
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
            onClick={() => postAction('/api/monopoly/buy', { buy: true })}
            loading={acting}
            disabled={(myState?.cash ?? 0) < (pendingSpace?.price ?? 0)}
          >
            Buy
          </MonopolyPrimaryButton>
          <MonopolySecondaryButton
            onClick={() => postAction('/api/monopoly/buy', { buy: false })}
            disabled={acting}
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
          onClick={() => postAction('/api/monopoly/rent')}
          loading={acting}
          disabled={(myState?.cash ?? 0) < rentAmount}
        >
          Pay ${rentAmount}
        </MonopolyPrimaryButton>
      </MonopolyModal>

      {/* Jail modal */}
      <MonopolyModal open={showJailModal} subtitle="In jail" title="🔒 Roll, pay, or use a card">
        <div className="space-y-2">
          <MonopolyPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting}>
            Roll for doubles
          </MonopolyPrimaryButton>
          <MonopolySecondaryButton
            onClick={() => postAction('/api/monopoly/jail', { method: 'pay' })}
            disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
          >
            Pay ${MONOPOLY_JAIL_FINE} fine
          </MonopolySecondaryButton>
          {(myState?.get_out_of_jail_free ?? 0) > 0 && (
            <MonopolySecondaryButton
              onClick={() => postAction('/api/monopoly/jail', { method: 'card' })}
              disabled={acting}
            >
              Use Get Out of Jail Free card
            </MonopolySecondaryButton>
          )}
        </div>
      </MonopolyModal>
    </MonopolyShell>
  )
}
