'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WordRushCard,
  WordRushLoadingScreen,
  WordRushShell,
  WordRushTeamRoster,
} from '@/components/word-rush/WordRushChrome'
import { WordRushPlayPanel } from '@/components/word-rush/WordRushPlay'
import { WordRushFinishedResults } from '@/components/word-rush/WordRushFinishedResults'
import { gameTypeConfig } from '@/lib/game-types'
import {
  clampWordRushMode,
  clampWordRushTeams,
  isWordRushResultsPhase,
  WORD_RUSH_MIN_PLAYERS,
  WORD_RUSH_MIN_PLAYERS_INDIVIDUAL,
  teamLabel,
} from '@/lib/word-rush'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { WORD_RUSH_ANSWER_SELECT, WORD_RUSH_PLAYER_SELECT, WORD_RUSH_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, WordRushAnswer, WordRushPlayer, WordRushSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { preJoinScreen, playerIsViewer, allowLatePlayers } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useWordRushTimer } from '@/hooks/useWordRushTimer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'lobby'
  | 'active'
  | 'finished'
  | 'not_found'

export function WordRushPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<WordRushSession | null>(null)
  const sessionRef = useRef<WordRushSession | null>(null)
  const [teamRows, setTeamRows] = useState<WordRushPlayer[]>([])
  const [answers, setAnswers] = useState<WordRushAnswer[]>([])
  const [acting, setActing] = useState(false)
  const [picking, setPicking] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: WordRushSession | null; ok: boolean }> => {
    const [sessionRes, teamRes, answerRes] = await Promise.all([
      supabase.from('word_rush_sessions').select(WORD_RUSH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('word_rush_players').select(WORD_RUSH_PLAYER_SELECT).eq('game_id', gameCode).order('created_at'),
      supabase
        .from('word_rush_answers')
        .select(WORD_RUSH_ANSWER_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(80),
    ])
    const sessionOk = supabasePollOk(sessionRes)
    const sessionData = sessionOk ? (sessionRes.data as WordRushSession | null) : null
    if (sessionOk) {
      setSession(sessionData)
      sessionRef.current = sessionData
    }
    if (supabasePollOk(teamRes)) setTeamRows((teamRes.data ?? []) as WordRushPlayer[])
    if (supabasePollOk(answerRes)) setAnswers((answerRes.data ?? []) as WordRushAnswer[])
    return {
      state: sessionOk ? sessionData : sessionRef.current,
      ok: supabasePollOk(sessionRes, teamRes, answerRes),
    }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: WordRushSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'lobby'
      if (isWordRushResultsPhase(gameData.status, sessionData)) return 'finished'
      if (gameData.status === 'active') return 'active'
      if (gameData.status === 'finished') return 'finished'
      return 'lobby'
    },
    []
  )

  const { screen, game, players, myPlayerId, myResumeToken, joinName, setJoinName, joining, load, lobbyFull, join } =
    useGameViewBootstrap<Screen, WordRushSession | null>({
      gameCode,
      loadingScreen: 'loading',
      notFoundScreen: 'not_found',
      loadGameState,
      computeScreen,
      onJoinError: toastError,
    })

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)
  useTurnNotifications({ status: game?.status })

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'word_rush_sessions', 'word_rush_players', 'word_rush_answers'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  const pickTeam = async (team: number) => {
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setPicking(true)
    try {
      const res = await fetch('/api/word-rush/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, team }),
      })
      const data = await res.json()
      if (!res.ok) toastError(data.error ?? 'Failed to pick team')
      else await load()
    } finally {
      setPicking(false)
    }
  }

  const sendAction = async (path: string, body: Record<string, unknown>) => {
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return { error: 'Session expired' }
    }
    setActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
        return { error: data.error ?? 'Action failed' }
      }
      await load()
      if (path.includes('/submit')) {
        return {
          correct: data.correct as boolean | undefined,
          points: data.points as number | undefined,
          message: data.message as string | undefined,
        }
      }
      return {}
    } finally {
      setActing(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    router.push('/')
  }

  const cfg = gameTypeConfig('word_rush')
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const isTeam = clampWordRushMode(game?.word_rush_mode) === 'team'
  const numTeams = clampWordRushTeams(game?.word_rush_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))
  const minPlayers = isTeam ? WORD_RUSH_MIN_PLAYERS : WORD_RUSH_MIN_PLAYERS_INDIVIDUAL

  const { secondsLeft, intermissionLeft, urgent } = useWordRushTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer
  )

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙ gear
  // (top header). Registered while the game is active; GameChromeSettings renders it in the sheet.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <RulesInPlaySection game={game} />
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

  if (screen === 'loading') return <WordRushLoadingScreen />

  if (screen === 'not_found') {
    return (
      <WordRushShell>
        <WordRushCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <button onClick={() => router.push('/')} className="btn-secondary w-full py-2.5">
            Go home
          </button>
        </WordRushCard>
      </WordRushShell>
    )
  }

  if (screen === 'join') {
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="word_rush"
            subtitle={cfg.tagline}
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
          gameType="word_rush"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="word_rush" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
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

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game!} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game!} />
  }

  if (screen === 'lobby') {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={minPlayers}
            capacityGame={game}
            onToggleReady={async (ready) => {
              if (!myResumeToken) return
              await fetch('/api/players/ready', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
              })
              await load()
            }}
            onStart={() => {}}
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
          rulesLink={<GameRulesLink gameType="word_rush" variant="subtle" />}
          isSpectator={activePlayer?.spectator === true}
          onReadyError={toastError}
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
            isTeam ? (
              <WordRushCard className="p-4 space-y-2">
                <p className="text-center text-sm font-bold">Pick your team</p>
                <WordRushTeamRoster
                  numTeams={numTeams}
                  teamRows={teamPlain}
                  players={players}
                  myPlayerId={myPlayerId}
                  onPick={(team) => void pickTeam(team)}
                  picking={picking}
                />
                <p className="text-faint text-xs text-center">
                  {Array.from({ length: numTeams }, (_, i) => teamLabel(i + 1)).join(' vs ')} — race the clock!
                </p>
              </WordRushCard>
            ) : (
              <WordRushCard className="p-4 text-center space-y-1">
                <p className="text-sm font-bold">Everyone plays solo 🏆</p>
                <p className="text-faint text-xs">Answer each round&apos;s letter pair — most correct wins.</p>
              </WordRushCard>
            )
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished' && game) {
    return (
      <WordRushShell compact>
        <WordRushFinishedResults
          game={game}
          session={session}
          players={players}
          teamRows={teamRows}
          answers={answers}
          highlightPlayerId={myPlayerId}
        />
      </WordRushShell>
    )
  }

  return (
    <WordRushShell compact wide>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <WordRushPlayPanel
          session={session}
          players={players}
          teamRows={teamPlain}
          answers={answers}
          myPlayerId={myPlayerId}
          secondsLeft={secondsLeft}
          intermissionLeft={intermissionLeft}
          urgent={urgent}
          onSubmit={isViewer ? undefined : (text) => sendAction('/api/word-rush/submit', { text })}
          onPrompt={
            isViewer
              ? undefined
              : (startLetter, endLetter, minWordLength) =>
                  void sendAction('/api/word-rush/prompt', {
                    startLetter,
                    endLetter,
                    ...(minWordLength !== undefined ? { minWordLength } : {}),
                  })
          }
          acting={acting}
          readOnly={isViewer}
        />
      )}
    </WordRushShell>
  )
}
