'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PingPongCard,
  PingPongLoadingScreen,
  PingPongSecondaryButton,
  PingPongShell,
} from '@/components/ping-pong/PingPongChrome'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { PingPongFinalResultsShareBlock } from '@/components/ping-pong/PingPongFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { PingPongBoard } from '@/components/ping-pong/PingPongBoard'
import { gameTypeConfig } from '@/lib/game-types'
import { isPingPongResultsPhase, PING_PONG_MIN_PLAYERS } from '@/lib/ping-pong'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { PING_PONG_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, PingPongSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen =
  'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'waiting' | 'active' | 'finished' | 'not_found'

export function PingPongPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<PingPongSession | null>(null)
  const sessionRef = useRef<PingPongSession | null>(null)
  sessionRef.current = session
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: PingPongSession | null; ok: boolean }> => {
    const sessionRes = await supabase
      .from('ping_pong_sessions')
      .select(PING_PONG_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    const ok = supabasePollOk(sessionRes)
    if (!ok) return { state: sessionRef.current ?? null, ok: false }
    const sessionData = (sessionRes.data as PingPongSession | null) ?? null
    setSession(sessionData)
    return { state: sessionData, ok: true }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: PingPongSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData && sessionData.status !== 'finished') return 'active'
      if (isPingPongResultsPhase(gameData.status, sessionData)) return 'finished'
      return 'waiting'
    },
    []
  )

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
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, PingPongSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme, game?.game_type)

  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as PingPongSession
    const prev = sessionRef.current
    if (prev && next.updated_at && prev.updated_at && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null && prev.status === 'active' && next.status === 'active'
  }, [])

  const connected = useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, { table: 'ping_pong_sessions', apply: applySessionRow }],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

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

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const cfg = gameTypeConfig('ping_pong')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  useTurnNotifications({
    status: game?.status,
    isMyTurn: null,
    enabled: !isViewer,
  })

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; GameChromeSettings renders it.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, game?.status, gameCode, myName, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <PingPongLoadingScreen />

  if (screen === 'not_found') {
    return (
      <PingPongShell title="Game not found">
        <PingPongCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <PingPongSecondaryButton onClick={() => router.push('/')}>Go home</PingPongSecondaryButton>
        </PingPongCard>
      </PingPongShell>
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
            gameType="ping_pong"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="ping_pong"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="ping_pong" variant="subtle" />
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
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={PING_PONG_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="ping_pong" variant="subtle" />}
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
      <PingPongShell compact>
        {game ? (
          <PingPongFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <PingPongCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">
              {winner ? (iWon ? 'You win!' : `${winner.name} wins!`) : 'Game ended early'}
            </p>
          </PingPongCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="ping_pong"
            gameCode={gameCode}
            winnerName={myName ?? ''}
            roundKey={session?.id}
          />
        )}
      </PingPongShell>
    )
  }

  return (
    <PingPongShell title={game?.title ?? cfg.label} compact>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <PingPongBoard
          gameCode={gameCode}
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          myResumeToken={myResumeToken}
          isViewer={isViewer}
          theme={game?.theme}
          onPointScored={load}
          sessionStartedAt={game?.session_started_at ?? null}
          gameDurationSeconds={game?.game_duration_seconds ?? 0}
        />
      )}
    </PingPongShell>
  )
}
