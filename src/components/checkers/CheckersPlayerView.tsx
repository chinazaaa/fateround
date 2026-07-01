'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckersCard,
  CheckersLoadingScreen,
  CheckersSecondaryButton,
  CheckersShell,
} from '@/components/checkers/CheckersChrome'
import { CheckersFinalResultsShareBlock } from '@/components/checkers/CheckersFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { CheckersGamePanel } from '@/components/checkers/CheckersBoard'
import { gameTypeConfig } from '@/lib/game-types'
import { currentTurnPlayerId, isCheckersResultsPhase } from '@/lib/checkers'
import { supabase } from '@/lib/supabase'
import { CHECKERS_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, CheckersSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
import { useCheckersClockExpiry } from '@/hooks/useCheckersClocks'

type Screen =
  'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'waiting' | 'active' | 'finished' | 'not_found'

export function CheckersPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const { confirm } = useConfirm()
  const [session, setSession] = useState<CheckersSession | null>(null)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: CheckersSession | null; ok: boolean }> => {
    const sessionRes = await supabase
      .from('checkers_sessions')
      .select(CHECKERS_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as CheckersSession | null) : null
    if (sessionData) {
      setSession(sessionData)
    }
    return { state: sessionData, ok: supabasePollOk(sessionRes) }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: CheckersSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (isCheckersResultsPhase(gameData.status, sessionData)) return 'finished'
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
    join,
  } = useGameViewBootstrap<Screen, CheckersSession | null>({
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

  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'checkers_sessions'], load)

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

  const movePiece = async (from: string, to: string) => {
    if (!myPlayerId || !session) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch('/api/checkers/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, from, to }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Move failed')
      } else {
        await load()
      }
    } catch {
      toastError('Move failed')
    } finally {
      setActing(false)
    }
  }

  const resign = async () => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const ok = await confirm({
      title: 'Resign this game?',
      message: 'Your opponent will be awarded the win.',
      confirmLabel: 'Resign',
      destructive: true,
    })
    if (!ok) return
    setActing(true)
    try {
      const res = await fetch('/api/checkers/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to resign')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const cfg = gameTypeConfig('checkers')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  useCheckersClockExpiry(gameCode, session, game?.status === 'active' && !isViewer)

  if (screen === 'loading') return <CheckersLoadingScreen />

  if (screen === 'not_found') {
    return (
      <CheckersShell title="Game not found">
        <CheckersCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <CheckersSecondaryButton onClick={() => router.push('/')}>Go home</CheckersSecondaryButton>
        </CheckersCard>
      </CheckersShell>
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
            gameType="checkers"
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
              <GameRulesLink gameType="checkers" variant="subtle" />
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
          rulesLink={<GameRulesLink gameType="checkers" variant="subtle" />}
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
    const finishedName = players.find((p) => p.id === myPlayerId)?.name
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? finishedName : winner?.name

    return (
      <CheckersShell compact>
        {game ? (
          <CheckersFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <CheckersCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{session?.is_draw ? '🤝' : winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">
              {session?.is_draw
                ? "It's a draw!"
                : winner
                  ? iWon
                    ? 'You win!'
                    : `${winner.name} wins!`
                  : 'Game ended early'}
            </p>
          </CheckersCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="checkers"
            gameCode={gameCode}
            winnerName={finishedName ?? ''}
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
      </CheckersShell>
    )
  }

  return (
    <CheckersShell title={game?.title ?? cfg.label} compact>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <CheckersGamePanel
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          timeControlSeconds={game?.timer_seconds ?? 0}
          onMove={isMyTurn && !isViewer ? movePiece : undefined}
          onResign={!isViewer ? resign : undefined}
          acting={acting}
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
    </CheckersShell>
  )
}
