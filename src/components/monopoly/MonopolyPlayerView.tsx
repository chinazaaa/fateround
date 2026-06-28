'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonopolyActiveLayout } from '@/components/monopoly/MonopolyActiveLayout'
import { MonopolyJoinForm } from '@/components/monopoly/MonopolyJoinForm'
import { tokenColorForOrder } from '@/components/monopoly/monopoly-ui'
import { monopolyTokenEmoji, type MonopolyTokenId } from '@/lib/monopoly-tokens'
import { MONOPOLY_COLOR_CLASSES } from '@/lib/monopoly'
import type { MonopolyColorGroup } from '@/lib/monopoly'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { MonopolyPageHeader } from '@/components/monopoly/MonopolyChrome'
import { gameTypeConfig } from '@/lib/game-types'
import { MonopolyFinalResultsShareBlock } from '@/components/monopoly/MonopolyFinalResultsShareBlock'
import { buildMonopolyStandings, MONOPOLY_MIN_PLAYERS, MONOPOLY_STARTING_CASH } from '@/lib/monopoly'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import {
  getPlayerSession,
  setPlayerSession,
  clearPlayerSession,
  isFetchNetworkError,
  messageFromFetchActionError,
} from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { markPlayerReady } from '@/lib/player-ready'
import { useMonopolyNotifications } from '@/hooks/useMonopolyNotifications'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

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
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joinToken, setJoinToken] = useState<MonopolyTokenId | null>(null)
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [acting, setActing] = useState(false)
  const actingRef = useRef(false)

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      if (pre === 'game_ended') {
        setScreen('game_ended')
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
    setScreen(playerId ? 'finished' : 'game_ended')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, boardRes, stateRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('monopoly_player_state')
        .select(MONOPOLY_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
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

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    } else {
      setMyPlayerId(null)
      setMyPlayerName(null)
    }
    setMyResumeToken(session?.resumeToken ?? null)
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`monopoly-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => void load()
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

  const join = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      const joiningAsViewer = game?.status === 'active'
      if (!joiningAsViewer && !joinToken) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(joiningAsViewer ? { joinAsViewer: opts?.joinAsViewer ?? true } : { monopolyToken: joinToken }),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to join')
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        setMyResumeToken(data.resumeToken ?? null)
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to join')
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, joinToken, load, toastError]
  )

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId || actingRef.current) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    actingRef.current = true
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      let data: { error?: string }
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Invalid server response' : `Request failed (${res.status})`)
      }
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(messageFromFetchActionError(err))
      if (isFetchNetworkError(err)) await load()
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName(null)
    setMyResumeToken(null)
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('monopoly')
  const myState = states.find((s) => s.player_id === myPlayerId)
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null

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
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
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
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        wide
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="monopoly" />}
      >
        <MonopolyJoinForm
          name={joinName}
          onNameChange={setJoinName}
          tokenId={joinToken}
          onTokenChange={setJoinToken}
          players={players}
          joining={joining}
          joiningAsViewer={joiningAsViewer}
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join Monopoly'}
          onSubmit={() => void join()}
        />
        <p className="text-faint text-xs leading-relaxed text-center">
          {joiningAsViewer
            ? 'This game is in progress — you will join as a viewer and watch live (read-only).'
            : `${MONOPOLY_MIN_PLAYERS}–6 players · £${MONOPOLY_STARTING_CASH.toLocaleString('en-GB')} starting cash.`}
        </p>
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const displayName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? 'Player'
    const isSpectator = me?.spectator === true
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <div className="space-y-4">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-4 py-4 text-center space-y-1">
            {isSpectator ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">New round</p>
                <h2 className="text-xl sm:text-2xl font-black">Ready for another game?</h2>
                <p className="text-muted text-sm">Tap below to join the next round</p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!myResumeToken) return
                      await markPlayerReady(gameCode, myResumeToken)
                      await load()
                    }}
                    className="btn-primary w-full py-3 text-base font-bold"
                  >
                    I&apos;m in — ready to play
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                  You&apos;re in
                </p>
                <h2 className="text-xl sm:text-2xl font-black">You&apos;re in, {displayName}!</h2>
                <p className="text-muted text-sm leading-relaxed">
                  Waiting for the host to start. You&apos;ll begin with £
                  {MONOPOLY_STARTING_CASH.toLocaleString('en-GB')} when the game begins.
                </p>
              </>
            )}
            <p className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[var(--foreground)]">
              <span className="leading-none">{cfg.headerEmoji}</span>
              <span>{cfg.label}</span>
            </p>
          </div>
          <GameRulesLink gameType="monopoly" variant="subtle" />
          <div className="glass-card-strong p-4 text-center">
            <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
            <p className="text-sm text-muted">
              player{players.length === 1 ? '' : 's'} joined · need {MONOPOLY_MIN_PLAYERS}+
            </p>
          </div>
          {players.length > 0 && (
            <div className="space-y-2">
              {players.map((p, index) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--surface-inset-bg)]">
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full text-lg ring-2',
                      tokenColorForOrder(index).bg,
                      tokenColorForOrder(index).ring,
                    ].join(' ')}
                  >
                    {monopolyTokenEmoji(p.monopoly_token, index)}
                  </span>
                  <span className="font-semibold text-sm">{p.name}</span>
                  {p.id === myPlayerId && (
                    <span className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
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
        </div>
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const winner = players.find((p) => p.id === board?.winner_player_id)
    const finishedWinnerName =
      winner?.name ??
      (board && states.length
        ? buildMonopolyStandings(
            states,
            players,
            board.property_owners,
            board.property_buildings,
            board.mortgaged_properties
          )[0]?.name
        : null)

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {game ? (
            <MonopolyFinalResultsShareBlock
              game={game}
              players={players}
              states={states}
              board={board}
              winnerName={finishedWinnerName}
              highlightPlayerId={myPlayerId}
            />
          ) : (
            <div className="glass-card p-8 text-center space-y-3">
              <p className="text-4xl">🏆</p>
              <h2 className="text-xl font-black gradient-title">
                {finishedWinnerName ? `${finishedWinnerName} wins!` : 'Game over'}
              </h2>
            </div>
          )}
        </div>
      </div>
    )
  }

  const sessionName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? ''
  const myPlayer = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading board…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24 overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3 sm:py-6 space-y-3 sm:space-y-4">
        <MonopolyPageHeader title={game?.title}>
          {myPlayerId && sessionName ? (
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={sessionName}
              onRenamed={(name) => {
                setMyPlayerName(name)
                setPlayerSession(gameCode, myPlayerId, name, 'both')
              }}
              onLeft={handlePlayerLeft}
              align="center"
            />
          ) : null}
        </MonopolyPageHeader>

        {isViewer && myPlayer && (
          <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
        )}

        <MonopolyActiveLayout
          gameCode={gameCode}
          game={game}
          board={board}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          myState={isViewer ? undefined : myState}
          myName={sessionName}
          acting={acting}
          postAction={postAction}
          colorBarClass={colorBarClass}
          spectator={isViewer}
        />
      </div>
    </div>
  )
}
