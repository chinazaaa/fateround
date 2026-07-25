'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AyoCard, AyoLoadingScreen, AyoSecondaryButton, AyoShell } from '@/components/ayo/AyoChrome'
import { AyoFinalResultsShareBlock } from '@/components/ayo/AyoFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { AyoGamePanel } from '@/components/ayo/AyoBoard'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentTurnPlayerId,
  isAyoResultsPhase,
  AYO_MIN_PLAYERS,
  parseAyoVariant,
  boardConfigFromSession,
} from '@/lib/ayo'
import { useAyoSowAnimation } from '@/hooks/useAyoSowAnimation'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { AYO_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, AyoSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useAyoClockExpiry } from '@/hooks/useAyoClocks'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function AyoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const { animation: sowAnimation, playSowAnimation } = useAyoSowAnimation()
  const { confirm } = useConfirm()
  const [session, setSession] = useState<AyoSession | null>(null)
  const sessionRef = useRef<AyoSession | null>(null)
  sessionRef.current = session
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: AyoSession | null; ok: boolean }> => {
    const sessionRes = await supabase
      .from('ayo_sessions')
      .select(AYO_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as AyoSession | null) : null
    if (sessionData) {
      setSession(sessionData)
    }
    return { state: sessionData, ok: supabasePollOk(sessionRes) }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: AyoSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (isAyoResultsPhase(gameData.status, sessionData)) return 'finished'
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
  } = useGameViewBootstrap<Screen, AyoSession | null>({
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

  // Delta fast-path: patch the session locally on an ordinary move and skip the full reload;
  // a status change (→ finished) or the first row still reloads. See useGameTableSync `apply`.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as AyoSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null && prev.status === 'active' && next.status === 'active'
  }, [])

  const connected = useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, { table: 'ayo_sessions', apply: applySessionRow }],
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

  const sowPit = async (pitIndex: number) => {
    if (!myPlayerId || !session) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const config = boardConfigFromSession(session, parseAyoVariant(game?.ayo_variant))
    setActing(true)
    try {
      const animPromise = playSowAnimation(session.pits, pitIndex, config)
      const apiPromise = fetch('/api/ayo/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, pitIndex }),
      })
      const [res] = await Promise.all([apiPromise, animPromise])
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
      message: 'Your opponent will be crowned Ọta.',
      confirmLabel: 'Resign',
      destructive: true,
    })
    if (!ok) return
    setActing(true)
    try {
      const res = await fetch('/api/ayo/resign', {
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

  const cfg = gameTypeConfig('ayo')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  useAyoClockExpiry(gameCode, session, game?.status === 'active' && !isViewer)

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={activePlayer?.name ?? ''}
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
  }, [myPlayerId, game?.status, gameCode, activePlayer?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <AyoLoadingScreen />

  if (screen === 'not_found') {
    return (
      <AyoShell title="Game not found">
        <AyoCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <AyoSecondaryButton onClick={() => router.push('/')}>Go home</AyoSecondaryButton>
        </AyoCard>
      </AyoShell>
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
            gameType="ayo"
            meta={game ? <GameInfoChips game={game} /> : null}
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
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
          gameType="ayo"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="ayo" variant="subtle" />
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
            minPlayers={AYO_MIN_PLAYERS}
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
          rulesLink={<GameRulesLink gameType="ayo" variant="subtle" />}
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
      <AyoShell compact>
        {game ? (
          <AyoFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <AyoCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{session?.is_draw ? '🤝' : winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">
              {session?.is_draw
                ? "It's a draw!"
                : winner
                  ? iWon
                    ? 'You are Ọta!'
                    : `${winner.name} is Ọta!`
                  : 'Game ended early'}
            </p>
          </AyoCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="ayo"
            gameCode={gameCode}
            winnerName={finishedName ?? ''}
            roundKey={game.session_started_at ?? session?.id}
          />
        )}
      </AyoShell>
    )
  }

  return (
    <AyoShell title={game?.title ?? cfg.label} compact>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <AyoGamePanel
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          timeControlSeconds={game?.timer_seconds ?? 0}
          variant={parseAyoVariant(game?.ayo_variant)}
          onMove={isMyTurn && !isViewer ? sowPit : undefined}
          onResign={!isViewer ? resign : undefined}
          acting={acting}
          sowAnimation={sowAnimation.animating ? sowAnimation : null}
        />
      )}
    </AyoShell>
  )
}
