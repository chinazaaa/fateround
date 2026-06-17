'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MonopolyClassicBoard,
  MonopolyDiceRoll,
  MonopolyPlayerList,
} from '@/components/monopoly/MonopolyBoard'
import { MonopolyActiveLayout } from '@/components/monopoly/MonopolyActiveLayout'
import { MONOPOLY_COLOR_CLASSES } from '@/lib/monopoly'
import type { MonopolyColorGroup } from '@/lib/monopoly'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import {
  MonopolyCashBadge,
  MonopolyStatusBanner,
  MonopolyTurnStrip,
} from '@/components/monopoly/MonopolyChrome'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  MONOPOLY_MIN_PLAYERS,
  MONOPOLY_STARTING_CASH,
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
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useMonopolyNotifications } from '@/hooks/useMonopolyNotifications'
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

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName(null)
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('monopoly')
  const myState = states.find((s) => s.player_id === myPlayerId)
  const turnPlayerId = board ? currentPlayerId(board) : null
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt

  useMonopolyNotifications({
    game,
    board,
    myPlayerId,
    myState,
    players,
    enabled: screen === 'active',
  })

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-xl font-bold">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary">
          Go home
        </button>
      </div>
    )
  }

  if (screen === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-5">
          <div className="text-center space-y-1">
            <div className="text-4xl">{cfg.headerEmoji}</div>
            <h1 className="text-2xl font-black gradient-title">{game?.title}</h1>
            <GameTypeBadge gameType="monopoly" />
          </div>
          <div>
            <label className="label-caps block mb-2">Your name</label>
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Enter your name"
              className="input-field w-full"
              maxLength={40}
            />
          </div>
          <p className="text-faint text-xs leading-relaxed">
            {MONOPOLY_MIN_PLAYERS}–6 players · £{MONOPOLY_STARTING_CASH.toLocaleString('en-GB')} starting cash. Roll, buy
            properties, build houses, and trade your way to victory.
          </p>
          <button
            type="button"
            onClick={() => void join()}
            disabled={!joinName.trim() || joining}
            className="btn-primary w-full"
          >
            {joining ? 'Joining…' : 'Join Monopoly'}
          </button>
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  if (screen === 'waiting') {
    const displayName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? 'Player'
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-4">
          <div className="text-center space-y-1">
            <div className="text-4xl">{cfg.headerEmoji}</div>
            <h2 className="text-xl font-black">You&apos;re in, {displayName}!</h2>
            <p className="text-muted text-sm leading-relaxed">
              Waiting for the host to start. You&apos;ll begin with £{MONOPOLY_STARTING_CASH.toLocaleString('en-GB')} when
              the game begins.
            </p>
          </div>
          <div className="glass-card-strong p-4 text-center">
            <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
            <p className="text-sm text-muted">
              player{players.length === 1 ? '' : 's'} joined · need {MONOPOLY_MIN_PLAYERS}+
            </p>
          </div>
          {players.length > 0 && (
            <div className="space-y-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--surface-inset-bg)]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_25%,transparent)] text-sm font-bold">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-sm">{p.name}</span>
                  {p.id === myPlayerId && (
                    <span className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <GameRulesLink gameType="monopoly" variant="subtle" />
          {myPlayerId && (
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={displayName}
              onRenamed={(name) => {
                setMyPlayerName(name)
                setPlayerSession(gameCode, myPlayerId, name, 'both')
              }}
              onLeft={handlePlayerLeft}
              inLobby
            />
          )}
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  if (screen === 'finished') {
    const winner = players.find((p) => p.id === board?.winner_player_id)
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <div className="glass-card p-8 text-center space-y-3">
            <p className="text-4xl">🏆</p>
            <h2 className="text-xl font-black gradient-title">
              {winner ? `${winner.name} wins!` : 'Game over'}
            </h2>
            {winner && <p className="text-sm text-muted">Monopoly champion</p>}
          </div>
          <MonopolyPlayerList
            states={states}
            players={players}
            propertyOwners={board?.property_owners}
            myPlayerId={myPlayerId}
          />
          <CreateNewGameButton />
        </div>
      </div>
    )
  }

  const sessionName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? ''

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading board…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight gradient-title truncate">{game?.title}</h1>
            <p className="text-faint text-xs">{cfg.label}</p>
          </div>
          {myPlayerId && sessionName && (
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={sessionName}
              onRenamed={(name) => {
                setMyPlayerName(name)
                setPlayerSession(gameCode, myPlayerId, name, 'both')
              }}
              onLeft={handlePlayerLeft}
            />
          )}
        </div>

        <MonopolyActiveLayout
          board={board}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          myState={myState}
          myName={sessionName}
          acting={acting}
          postAction={postAction}
          colorBarClass={colorBarClass}
          boardCenter={
            <div className="flex flex-col items-center justify-center h-full gap-2 px-1">
              <MonopolyDiceRoll dice={board.last_dice} rolling={acting} />
              {isMyTurn && board.phase === 'roll' && !myState?.in_jail && (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => postAction('/api/monopoly/roll')}
                  className="btn-primary btn-fit px-4 py-2 text-xs"
                >
                  {acting ? '…' : '🎲 Roll'}
                </button>
              )}
            </div>
          }
        />
      </div>
    </div>
  )
}
