'use client'

import { useCallback, useRef, useState } from 'react'
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
import { LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, LudoDiceRoll, LudoPlayerState, LudoSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
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
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<LudoDiceRoll | null>(null)
  const rollStartedRef = useRef(0)

  // Game-specific load: fetch the ludo session + per-player state (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: void; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      supabase.from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('ludo_player_state').select(LUDO_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (supabasePollOk(sessionRes)) setSession(sessionRes.data as LudoSession | null)
    if (supabasePollOk(statesRes)) setStates((statesRes.data as LudoPlayerState[]) ?? [])
    return { state: undefined, ok: supabasePollOk(sessionRes, statesRes) }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

  const {
    screen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, void>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'ludo_sessions', 'ludo_player_state'], load)

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

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
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
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
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
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
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="ludo" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
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
