'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { LandmineActiveRound } from '@/components/landmine/LandmineActiveRound'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { gameTypeConfig } from '@/lib/game-types'
import { LANDMINE_MIN_PLAYERS } from '@/lib/landmine'
import { supabase } from '@/lib/supabase'
import { LANDMINE_ANSWER_SELECT, LANDMINE_MARK_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, LandmineAnswer, LandmineMark, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EliminationBanner } from '@/components/EliminationBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'lobby'
  | 'playing'
  | 'not_found'

export function LandminePlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<LandmineAnswer[]>([])
  const [marks, setMarks] = useState<LandmineMark[]>([])
  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [rdsRes, ansRes, marksRes] = await Promise.all([
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('landmine_answers').select(LANDMINE_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('landmine_marks').select(LANDMINE_MARK_SELECT).eq('game_id', gameCode),
    ])
    const ok = supabasePollOk(rdsRes, ansRes, marksRes)
    if (ok) {
      setRounds(rdsRes.data ?? [])
      setAnswers(ansRes.data ?? [])
      setMarks(marksRes.data ?? [])
    }
    return { state: null, ok }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      return pre === 'game_started_waiting'
        ? 'game_started_waiting'
        : pre === 'late_join_choice'
          ? 'late_join_choice'
          : pre === 'game_ended'
            ? 'game_ended'
            : 'join'
    }
    return gameData.status === 'waiting' ? 'lobby' : 'playing'
  }, [])

  const {
    screen,
    setScreen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
    onJoinSuccess: (data) => success(`Joined as ${data.playerName}`),
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  useTurnNotifications({ status: game?.status })

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'landmine_answers', 'landmine_marks'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  // Safety reload while the game is active, even when realtime LOOKS connected. Landmine is
  // phase-based (category → writing → marking → reveal), so a single dropped realtime event
  // would otherwise leave a client stuck on the old phase until the next event — which is what
  // made the marking screen show up late / out of order. This self-heals a miss within ~10s.
  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.activeGame,
    enabled: connected && game?.status === 'active',
    runImmediately: false,
  })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting' || screen === 'playing') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && game.status !== 'waiting' && playerIsViewer(me, game))
  const myPlayerName = me?.name ?? ''

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
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
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

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
    setMyResumeToken(null)
    setJoinName('')
    setScreen('join')
  }

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

  const cfg = gameTypeConfig('landmine')

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-xl font-bold">Game not found</p>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        playersAllowed={allowLatePlayers(game)}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
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
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="landmine" />}
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="landmine"
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'lobby' && myPlayerId) {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={LANDMINE_MIN_PLAYERS}
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
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Lobby"
          rulesLink={<GameRulesLink gameType="landmine" variant="subtle" />}
          isSpectator={me?.spectator === true || me?.is_eliminated === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
          activity={
            <>
              {isViewer && (
                <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
              )}
              {!isViewer && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-5 text-center space-y-1">
                  <p className="text-2xl">🧨</p>
                  <p className="font-semibold">Ready to play</p>
                  <p className="text-sm text-muted">Waiting for the host to start…</p>
                </div>
              )}
            </>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'playing' && game && myPlayerId) {
    return (
      <div className="min-h-screen pb-16">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          {game.status !== 'finished' && (
            <div className="text-center space-y-1">
              <div className="text-3xl">{cfg.headerEmoji}</div>
              <h1 className="text-xl font-black gradient-title">{game.title}</h1>
            </div>
          )}
          {me && <EliminationBanner player={me} />}
          {isViewer && game.status !== 'finished' && (
            <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
          )}
          <LandmineActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            rounds={rounds}
            answers={answers}
            marks={marks}
            myPlayerId={myPlayerId}
            myResumeToken={myResumeToken}
            playerName={myPlayerName}
            onReload={load}
            readOnly={isViewer}
          />
        </div>
      </div>
    )
  }

  return null
}
