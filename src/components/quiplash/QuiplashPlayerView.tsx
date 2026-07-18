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
import { QuiplashActiveRound } from '@/components/quiplash/QuiplashActiveRound'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import {
  QUIPLASH_ANSWER_SELECT,
  QUIPLASH_BATTLE_SELECT,
  QUIPLASH_SESSION_SELECT,
  QUIPLASH_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, QuiplashAnswer, QuiplashBattle, QuiplashSession, QuiplashVote, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen, allowLatePlayers } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { QUIPLASH_MIN_PLAYERS } from '@/lib/quiplash'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'lobby'
  | 'playing'
  | 'not_found'

export function QuiplashPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [rounds, setRounds] = useState<Round[]>([])
  const [session, setSession] = useState<QuiplashSession | null>(null)
  const [answers, setAnswers] = useState<QuiplashAnswer[]>([])
  const [battles, setBattles] = useState<QuiplashBattle[]>([])
  const [votes, setVotes] = useState<QuiplashVote[]>([])
  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [rdsRes, sessRes, ansRes, batRes, voteRes] = await Promise.all([
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('quiplash_sessions').select(QUIPLASH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('quiplash_answers').select(QUIPLASH_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('quiplash_battles').select(QUIPLASH_BATTLE_SELECT).eq('game_id', gameCode),
      supabase.from('quiplash_votes').select(QUIPLASH_VOTE_SELECT).eq('game_id', gameCode),
    ])
    if (supabasePollOk(rdsRes)) setRounds((rdsRes.data ?? []) as Round[])
    if (supabasePollOk(sessRes)) setSession((sessRes.data as QuiplashSession | null) ?? null)
    if (supabasePollOk(ansRes)) setAnswers((ansRes.data ?? []) as QuiplashAnswer[])
    if (supabasePollOk(batRes)) setBattles((batRes.data ?? []) as QuiplashBattle[])
    if (supabasePollOk(voteRes)) setVotes((voteRes.data ?? []) as QuiplashVote[])
    return { state: null, ok: supabasePollOk(rdsRes, sessRes, ansRes, batRes, voteRes) }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
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
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      'rounds',
      'quiplash_sessions',
      'quiplash_answers',
      'quiplash_battles',
      'quiplash_votes',
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (
      screen === 'game_started_waiting' ||
      screen === 'late_join_choice' ||
      screen === 'lobby' ||
      screen === 'playing'
    )
      void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const myPlayerName = me?.name ?? ''
  const isViewer = !!(game && me && playerIsViewer(me, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
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

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice'
  )
  const cfg = gameTypeConfig('quiplash')

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

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-lg">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted text-lg">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary py-3 px-6 text-base">
          Home
        </button>
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
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
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
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameJoinHeader
          emoji={cfg.headerEmoji}
          title={game?.title}
          gameType="quiplash"
          meta={
            game ? (
              <>
                {game.rounds_count} rounds · {game.timer_seconds}s to answer · {game.operative_timer_seconds ?? 15}s to
                vote
              </>
            ) : null
          }
        />
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="quiplash"
        />
      </GameJoinLobbyShell>
    )
  }

  if (!game || !myPlayerId) return null

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <ReplayReadyRing
          players={players}
          meId={myPlayerId}
          isHost={false}
          minPlayers={QUIPLASH_MIN_PLAYERS}
          onToggleReady={(ready) => void toggleReplayReady(ready)}
          onStart={() => {}}
          pending={replayReadyPending}
          gameCode={gameCode}
          onLeft={handlePlayerLeft}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'lobby') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          description={
            <>
              {game.rounds_count} rounds · {game.timer_seconds}s to answer · {game.operative_timer_seconds ?? 15}s to
              vote
            </>
          }
          rulesLink={<GameRulesLink gameType="quiplash" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReadyError={toastError}
          onReady={async () => {
            if (!myResumeToken) {
              toastError('Your player session expired — rejoin to continue')
              return
            }
            const res = await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error ?? 'Failed to ready up')
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  const isFinished = game.status === 'finished'

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {!isFinished && (
          <div className="text-center space-y-1">
            <div className="text-4xl sm:text-5xl">{cfg.headerEmoji}</div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{game.title}</h1>
            <p className="text-muted text-sm sm:text-base">{cfg.label}</p>
          </div>
        )}

        {isViewer && !isFinished && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            players={players}
            onPromoted={load}
          />
        )}
        {!isFinished && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myPlayerName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            inLobby={false}
            spectating={isViewer}
          />
        )}
        <QuiplashActiveRound
          gameCode={gameCode}
          game={game}
          players={players}
          rounds={rounds}
          session={session}
          answers={answers}
          battles={battles}
          votes={votes}
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
