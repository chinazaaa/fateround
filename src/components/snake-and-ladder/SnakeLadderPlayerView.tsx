'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  SnakeLadderCard,
  SnakeLadderLoadingScreen,
  SnakeLadderSecondaryButton,
  SnakeLadderShell,
} from '@/components/snake-and-ladder/SnakeLadderChrome'
import { SnakeLadderGamePanel } from '@/components/snake-and-ladder/SnakeLadderBoard'
import { SnakeLadderFinalResultsShareBlock } from '@/components/snake-and-ladder/SnakeLadderFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId } from '@/lib/snake-and-ladder'
import { supabase } from '@/lib/supabase'
import { SNAKE_LADDER_PLAYER_STATE_SELECT, SNAKE_LADDER_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'
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
import {
  useSnakeLadderNotifications,
  useSnakeLadderTurnTimer,
  playSnakeLadderActionSound,
  playSnakeLadderRollSound,
} from '@/hooks/useSnakeLadder'

const ROLL_MIN_MS = 700
/** After someone reaches 100, linger on the board so everyone sees the winning
 *  move before the final leaderboard appears. */
const WIN_HOLD_MS = 9000

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function SnakeLadderPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<SnakeLadderSession | null>(null)
  const [states, setStates] = useState<SnakeLadderPlayerState[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayRoll, setDisplayRoll] = useState<number | null>(null)
  const [holdWin, setHoldWin] = useState(false)
  const winHandledRef = useRef(false)
  const sawActiveRef = useRef(false)
  const rollStartedRef = useRef(0)

  // Game-specific load: fetch the snake-and-ladder session + per-player state (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: void; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      supabase.from('snake_ladder_sessions').select(SNAKE_LADDER_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('snake_ladder_player_state')
        .select(SNAKE_LADDER_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (supabasePollOk(sessionRes)) setSession(sessionRes.data as SnakeLadderSession | null)
    if (supabasePollOk(statesRes)) setStates((statesRes.data as SnakeLadderPlayerState[]) ?? [])
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
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'snake_ladder_sessions', 'snake_ladder_player_state'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  useRoomMemberAutoJoin({
    gameCode,
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

  const roll = async () => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    rollStartedRef.current = Date.now()
    setRolling(true)
    setDisplayRoll(null)
    playSnakeLadderRollSound()
    try {
      const res = await fetch('/api/snake-and-ladder/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        if (typeof data.roll === 'number') setDisplayRoll(data.roll)
        playSnakeLadderActionSound()
        await load()
      }
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
      const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      setRolling(false)
    }
  }

  const cfg = gameTypeConfig('snake_and_ladder')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  const { secondsLeft, hasTimer, urgent } = useSnakeLadderTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer
  )

  useSnakeLadderNotifications({
    game,
    session,
    myPlayerId,
    players,
    enabled: (screen === 'active' || holdWin) && !isViewer,
  })

  // Hold on the finished board for a few seconds so the winning move is visible
  // before switching to the final leaderboard. Only triggers when we witnessed
  // live play (so opening an already-finished game for replay doesn't re-hold),
  // and survives a status/winner update race via sawActiveRef. Resets on replay.
  useEffect(() => {
    const status = game?.status
    if (status === 'active') sawActiveRef.current = true
    const finishedWithWinner = status === 'finished' && !!session?.winner_player_id
    if (finishedWithWinner && sawActiveRef.current && !winHandledRef.current) {
      winHandledRef.current = true
      setHoldWin(true)
      const t = setTimeout(() => setHoldWin(false), WIN_HOLD_MS)
      return () => clearTimeout(t)
    }
    if (status !== 'finished') {
      winHandledRef.current = false
      setHoldWin(false)
      if (status === 'waiting') sawActiveRef.current = false
    }
  }, [game?.status, session?.winner_player_id])

  // While holding, keep rendering the active board instead of the leaderboard.
  const effectiveScreen = holdWin && screen === 'finished' && session && states.length > 0 ? 'active' : screen

  if (screen === 'loading') return <SnakeLadderLoadingScreen />

  if (screen === 'not_found') {
    return (
      <SnakeLadderShell title="Game not found">
        <SnakeLadderCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <SnakeLadderSecondaryButton onClick={() => router.push('/')}>Go home</SnakeLadderSecondaryButton>
        </SnakeLadderCard>
      </SnakeLadderShell>
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
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="snake_and_ladder"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="snake_and_ladder" variant="subtle" />
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
          rulesLink={<GameRulesLink gameType="snake_and_ladder" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            try {
              const res = await fetch('/api/players/ready', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
              })
              if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                toastError(data.error ?? 'Failed to ready up')
                return
              }
              await load()
            } catch {
              toastError('Failed to ready up')
            }
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (effectiveScreen === 'finished') {
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? myName : winner?.name

    return (
      <SnakeLadderShell title="Game over!" subtitle={winner ? `${winner.name} wins` : 'Session ended'}>
        {game && states.length > 0 ? (
          <SnakeLadderFinalResultsShareBlock
            game={game}
            players={players}
            states={states}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <SnakeLadderCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">{winner ? `${winner.name} wins!` : 'Game ended early'}</p>
            <p className="text-sm text-muted">Waiting for the host to start a new round…</p>
          </SnakeLadderCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="snake_and_ladder"
            gameCode={gameCode}
            winnerName={myName ?? ''}
            roundKey={session?.id}
          />
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
      </SnakeLadderShell>
    )
  }

  return (
    <SnakeLadderShell title={game?.title ?? cfg.label} compact wide>
      {isViewer && <ViewerModeBanner />}
      {holdWin && winner && (
        <SnakeLadderCard className="p-3 text-center">
          <p className="text-lg font-black">🏆 {winner.name} wins!</p>
          <p className="text-xs text-muted">Final results in a moment…</p>
        </SnakeLadderCard>
      )}
      {session && (
        <SnakeLadderGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          onRoll={isMyTurn && !isViewer ? () => void roll() : undefined}
          acting={acting}
          rolling={rolling}
          displayRoll={displayRoll}
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
    </SnakeLadderShell>
  )
}
