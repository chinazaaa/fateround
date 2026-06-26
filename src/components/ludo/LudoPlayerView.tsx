'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LudoCard,
  LudoLoadingScreen,
  LudoPrimaryButton,
  LudoSecondaryButton,
  LudoShell,
} from '@/components/ludo/LudoChrome'
import { LudoGamePanel } from '@/components/ludo/LudoBoard'
import { LudoFinalResultsShareBlock } from '@/components/ludo/LudoFinalResultsShareBlock'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, parseLudoDice } from '@/lib/ludo'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, LudoDiceRoll, LudoPlayerState, LudoSession, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useLudoTurnTimer } from '@/hooks/useLudoTurnTimer'
import { useLudoNotifications, playLudoActionSound, playLudoRollSound } from '@/hooks/useLudoNotifications'

const ROLL_MIN_MS = 700

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function LudoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<LudoDiceRoll | null>(null)
  const rollStartedRef = useRef(0)

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
      setScreen('waiting')
      return
    }
    if (gameData.status === 'active') {
      setScreen('active')
      return
    }
    setScreen('finished')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, statesRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('ludo_player_state').select(LUDO_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, statesRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(sessionRes.data as LudoSession | null)
    setStates((statesRes.data as LudoPlayerState[]) ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
    } else {
      setMyPlayerId(null)
    }

    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  // A single move can update several rows at once, firing a burst of
  // postgres_changes events. Coalesce them into one reload to avoid refetch
  // storms and flicker from partial mid-write snapshots.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`ludo-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        scheduleLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ludo_sessions', filter: `game_id=eq.${gameCode}` },
        scheduleLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ludo_player_state', filter: `game_id=eq.${gameCode}` },
        scheduleLoad
      )
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer ?? true } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toastError(data.error ?? 'Failed to join')
          return
        }
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load, toastError]
  )

  useRoomMemberAutoJoin({
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    setActing(true)
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
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        if (data.dice) setDisplayDice(parseLudoDice(data.dice))
        if (path.includes('/roll') || path.includes('/move')) playLudoActionSound()
        await load()
      }
    } finally {
      setActing(false)
      if (path.includes('/roll')) {
        const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
      setRolling(false)
    }
  }

  const cfg = gameTypeConfig('ludo')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  const { secondsLeft, hasTimer, urgent } = useLudoTurnTimer(gameCode, session, game?.status === 'active' && !isViewer)

  useLudoNotifications({
    game,
    session,
    myPlayerId,
    players,
    enabled: screen === 'active' && !isViewer,
  })

  if (screen === 'loading') return <LudoLoadingScreen />

  if (screen === 'not_found') {
    return (
      <LudoShell title="Game not found">
        <LudoCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <LudoSecondaryButton onClick={() => router.push('/')}>Go home</LudoSecondaryButton>
        </LudoCard>
      </LudoShell>
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

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="ludo"
            subtitle={cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="ludo" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="ludo" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myPlayerId) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const myName = players.find((p) => p.id === myPlayerId)?.name
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? myName : winner?.name

    return (
      <LudoShell title="Game over!" subtitle={winner ? `${winner.name} wins` : 'Session ended'}>
        {game && states.length > 0 ? (
          <LudoFinalResultsShareBlock
            game={game}
            players={players}
            states={states}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <LudoCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">{winner ? `${winner.name} wins!` : 'Game ended early'}</p>
            <p className="text-sm text-muted">Waiting for the host to start a new round…</p>
          </LudoCard>
        )}
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            inLobby
          />
        )}
      </LudoShell>
    )
  }

  return (
    <LudoShell title={game?.title ?? cfg.label} compact wide>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <LudoGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          onRoll={isMyTurn && !isViewer ? () => postAction('/api/ludo/roll') : undefined}
          onMovePiece={
            isMyTurn && !isViewer
              ? (pieceId, diceIndex) => postAction('/api/ludo/move', { pieceId, diceIndex })
              : undefined
          }
          acting={acting}
          rolling={rolling}
          displayDice={displayDice}
        />
      )}
      {myPlayerId && myName && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
        />
      )}
    </LudoShell>
  )
}
