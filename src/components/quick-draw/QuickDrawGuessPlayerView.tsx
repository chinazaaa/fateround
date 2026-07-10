'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { QuickDrawGuessPlayPanel } from '@/components/quick-draw/QuickDrawGuessPlay'
import { QuickDrawGuessFinishedResults } from '@/components/quick-draw/QuickDrawGuessFinishedResults'
import { gameTypeConfig } from '@/lib/game-types'
import {
  QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL,
  QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM,
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
} from '@/lib/quick-draw-guess'
import { supabase } from '@/lib/supabase'
import {
  QUICK_DRAW_GUESS_GUESS_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  QUICK_DRAW_GUESS_SESSION_SELECT,
  QUICK_DRAW_GUESS_WORD_SELECT,
} from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type {
  QuickDrawGuessGuess,
  QuickDrawGuessPlayer,
  QuickDrawGuessSession,
  QuickDrawGuessWord,
  Game,
} from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useQuickDrawGuessTimer } from '@/hooks/useQuickDrawGuessTimer'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import {
  DescribeItCard,
  DescribeItLoadingScreen,
  DescribeItTeamRoster,
} from '@/components/describe-it/DescribeItChrome'

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

function isGuessResultsPhase(gameStatus: Game['status'], session: QuickDrawGuessSession | null): boolean {
  return gameStatus === 'finished' || session?.status === 'finished' || session?.phase === 'finished'
}

export function QuickDrawGuessPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<QuickDrawGuessSession | null>(null)
  const sessionRef = useRef<QuickDrawGuessSession | null>(null)
  const [teamRows, setTeamRows] = useState<QuickDrawGuessPlayer[]>([])
  const [words, setWords] = useState<QuickDrawGuessWord[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [acting, setActing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [replayReadyPending, setReplayReadyPending] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: QuickDrawGuessSession | null; ok: boolean }> => {
    const [sessionRes, teamRes, wordRes, guessRes] = await Promise.all([
      supabase
        .from('quick_draw_guess_sessions')
        .select(QUICK_DRAW_GUESS_SESSION_SELECT)
        .eq('game_id', gameCode)
        .maybeSingle(),
      supabase
        .from('quick_draw_guess_players')
        .select(QUICK_DRAW_GUESS_PLAYER_SELECT)
        .eq('game_id', gameCode)
        .order('created_at'),
      supabase.from('quick_draw_guess_words').select(QUICK_DRAW_GUESS_WORD_SELECT).eq('game_id', gameCode),
      supabase
        .from('quick_draw_guess_guesses')
        .select(QUICK_DRAW_GUESS_GUESS_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    const sessionOk = supabasePollOk(sessionRes)
    const sessionData = sessionOk ? (sessionRes.data as QuickDrawGuessSession | null) : null
    if (sessionOk) {
      setSession(sessionData)
      sessionRef.current = sessionData
    }
    if (supabasePollOk(teamRes)) setTeamRows((teamRes.data ?? []) as QuickDrawGuessPlayer[])
    if (supabasePollOk(wordRes)) setWords((wordRes.data ?? []) as QuickDrawGuessWord[])
    if (supabasePollOk(guessRes)) setGuesses((guessRes.data ?? []) as QuickDrawGuessGuess[])
    return {
      state: sessionOk ? sessionData : sessionRef.current,
      ok: supabasePollOk(sessionRes, teamRes, wordRes, guessRes),
    }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: QuickDrawGuessSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'lobby'
      if (isGuessResultsPhase(gameData.status, sessionData)) return 'finished'
      if (gameData.status === 'active') return 'active'
      return 'lobby'
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
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, QuickDrawGuessSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    onJoinError: toastError,
  })

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      'quick_draw_guess_sessions',
      'quick_draw_guess_players',
      'quick_draw_guess_words',
      'quick_draw_guess_guesses',
    ],
    load
  )
  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const pickTeam = async (team: number) => {
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setPicking(true)
    try {
      const res = await fetch('/api/quick-draw/guess-team', {
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
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/quick-draw/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) toastError(data.error ?? 'Action failed')
      else await load()
    } finally {
      setActing(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    void load()
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

  const cfg = gameTypeConfig('quick_draw')
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const isIndividual = clampQuickDrawPlayMode(game?.quick_draw_play_mode) === 'individual'
  const numTeams = clampQuickDrawNumTeams(game?.quick_draw_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))
  const minPlayers = isIndividual ? QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL : QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined

  const { secondsLeft, breakLeft, urgent } = useQuickDrawGuessTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer
  )

  if (screen === 'loading') return <DescribeItLoadingScreen />

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
        <button onClick={() => router.push('/')} className="btn-secondary mt-4">
          Go home
        </button>
      </div>
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
            gameType="quick_draw"
            subtitle="Draw & guess"
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
              <GameRulesLink gameType="quick_draw" variant="subtle" />
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
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }
  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'lobby' && game) {
    if (game.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={minPlayers}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
          />
        </GameJoinLobbyShell>
      )
    }

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader emoji={cfg.headerEmoji} title={game.title} gameType="quick_draw" subtitle="Draw & guess" />
        }
      >
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          gameType="quick_draw"
          rulesLink={<GameRulesLink gameType="quick_draw" variant="subtle" />}
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
          activity={
            isIndividual ? (
              <DescribeItCard className="p-4 space-y-1 text-center">
                <p className="text-sm font-bold">Everyone plays solo 🏆</p>
                <p className="text-faint text-xs">Take turns drawing while everyone races to guess.</p>
              </DescribeItCard>
            ) : (
              <DescribeItCard className="p-4 space-y-2">
                <p className="text-center text-sm font-bold">Pick your team</p>
                <DescribeItTeamRoster
                  numTeams={numTeams}
                  teamRows={teamPlain}
                  players={players}
                  myPlayerId={myPlayerId}
                  onPick={pickTeam}
                  picking={picking}
                />
              </DescribeItCard>
            )
          }
          activityFirst
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished' && game) {
    return (
      <div className="min-h-screen px-4 py-8 max-w-lg mx-auto space-y-4">
        <QuickDrawGuessFinishedResults game={game} players={players} words={words} playerScores={teamPlain} />
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            inLobby
            spectating={isViewer}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-lg mx-auto space-y-4">
      {isViewer && game && myPlayerId && (
        <ViewerModeBanner
          gameCode={gameCode}
          playerId={myPlayerId}
          game={game}
          player={me}
          players={players}
          onPromoted={load}
        />
      )}
      <h1 className="text-lg font-black text-center truncate">{game?.title ?? cfg.label}</h1>
      {session && (
        <QuickDrawGuessPlayPanel
          gameCode={gameCode}
          session={session}
          players={players}
          teamRows={teamPlain}
          words={words}
          guesses={guesses}
          myPlayerId={myPlayerId}
          myResumeToken={myResumeToken}
          secondsLeft={secondsLeft}
          breakLeft={breakLeft}
          urgent={urgent}
          onGuess={!isViewer ? (text) => void sendAction('guess', { text }) : undefined}
          onSkip={!isViewer ? () => void sendAction('guess-skip', {}) : undefined}
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
          spectating={isViewer}
        />
      )}
    </div>
  )
}
