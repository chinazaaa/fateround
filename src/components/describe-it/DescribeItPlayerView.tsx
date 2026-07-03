'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DescribeItCard,
  DescribeItLoadingScreen,
  DescribeItShell,
  DescribeItTeamRoster,
} from '@/components/describe-it/DescribeItChrome'
import { DescribeItPlayPanel } from '@/components/describe-it/DescribeItPlay'
import { DescribeItFinalResultsShareBlock } from '@/components/describe-it/DescribeItFinalResultsShareBlock'
import { gameTypeConfig } from '@/lib/game-types'
import {
  clampDescribeItMode,
  clampDescribeItTeams,
  describeItIndividualLeaderboard,
  isDescribeItResultsPhase,
} from '@/lib/describe-it'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { supabase } from '@/lib/supabase'
import {
  DESCRIBE_IT_SESSION_SELECT,
  DESCRIBE_IT_PLAYER_SELECT,
  DESCRIBE_IT_WORD_SELECT,
  DESCRIBE_IT_GUESS_SELECT,
} from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { DescribeItGuess, DescribeItPlayer, DescribeItSession, DescribeItWord, Game } from '@/types'
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
import { preJoinScreen, playerIsViewer, allowLatePlayers } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useDescribeItTimer } from '@/hooks/useDescribeItTimer'
import { useDescribeItSounds } from '@/hooks/useDescribeItSounds'

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

export function DescribeItPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<DescribeItSession | null>(null)
  const [teamRows, setTeamRows] = useState<DescribeItPlayer[]>([])
  const [words, setWords] = useState<DescribeItWord[]>([])
  const [guesses, setGuesses] = useState<DescribeItGuess[]>([])
  const [acting, setActing] = useState(false)
  const [picking, setPicking] = useState(false)

  // Game-specific load: fetch the describe-it session + team/word/guess rows (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: DescribeItSession | null; ok: boolean }> => {
    const [sessionRes, teamRes, wordRes, guessRes] = await Promise.all([
      supabase.from('describe_it_sessions').select(DESCRIBE_IT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('describe_it_players')
        .select(DESCRIBE_IT_PLAYER_SELECT)
        .eq('game_id', gameCode)
        .order('created_at'),
      supabase.from('describe_it_words').select(DESCRIBE_IT_WORD_SELECT).eq('game_id', gameCode),
      supabase
        .from('describe_it_guesses')
        .select(DESCRIBE_IT_GUESS_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    const sessionOk = supabasePollOk(sessionRes)
    const sessionData = sessionOk ? (sessionRes.data as DescribeItSession | null) : null
    // Only touch the session when its own read succeeded: this clears a stale session
    // when the query returns no row, while a *non-session* query failing leaves the
    // real session (and screen) intact — no spurious results→active flash.
    if (sessionOk) setSession(sessionData)
    if (supabasePollOk(teamRes)) setTeamRows((teamRes.data ?? []) as DescribeItPlayer[])
    if (supabasePollOk(wordRes)) setWords((wordRes.data ?? []) as DescribeItWord[])
    if (supabasePollOk(guessRes)) setGuesses((guessRes.data ?? []) as DescribeItGuess[])
    // `ok` gates the polling fallback's back-off — only "ok" when every read succeeded.
    return { state: sessionData, ok: supabasePollOk(sessionRes, teamRes, wordRes, guessRes) }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: DescribeItSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'lobby'
      if (isDescribeItResultsPhase(gameData.status, sessionData)) return 'finished'
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
  } = useGameViewBootstrap<Screen, DescribeItSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    onJoinError: toastError,
  })

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      'describe_it_sessions',
      'describe_it_players',
      'describe_it_words',
      'describe_it_guesses',
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const pickTeam = async (team: number) => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setPicking(true)
    try {
      const res = await fetch('/api/describe-it/team', {
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
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/describe-it/${path}`, {
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

  const cfg = gameTypeConfig('describe_it')
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const isIndividual = clampDescribeItMode(game?.describe_it_mode) === 'individual'
  const numTeams = clampDescribeItTeams(game?.describe_it_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))
  const playerScores = teamRows.map((r) => ({ player_id: r.player_id, score: r.score }))

  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null

  const { secondsLeft, breakLeft, urgent } = useDescribeItTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer
  )
  useDescribeItSounds({
    session,
    words,
    myTeam,
    myPlayerId,
    enabled: game?.status === 'active' && !isViewer,
  })

  if (screen === 'loading') return <DescribeItLoadingScreen />

  if (screen === 'not_found') {
    return (
      <DescribeItShell title="Game not found">
        <DescribeItCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <button onClick={() => router.push('/')} className="btn-secondary w-full py-2.5">
            Go home
          </button>
        </DescribeItCard>
      </DescribeItShell>
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
            gameType="describe_it"
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
              <GameRulesLink gameType="describe_it" variant="subtle" />
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

  if (screen === 'lobby') {
    const me = players.find((p) => p.id === myPlayerId)
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          activityFirst={!isIndividual}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="describe_it" variant="subtle" />}
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
                <p className="text-faint text-xs">
                  You&apos;ll take turns describing a word while everyone races to guess. Fastest guessers score the
                  most.
                </p>
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
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    // Individual mode only — team mode has no single-player winner.
    const individualLb = isIndividual ? describeItIndividualLeaderboard(playerScores, players) : []
    const myDescRow = individualLb.find((row) => row.id === myPlayerId)
    const iWonDescribe =
      !!myDescRow && individualLb[0] != null && myDescRow.score === individualLb[0].score && individualLb[0].score > 0
    return (
      <DescribeItShell compact>
        {game && (
          <DescribeItFinalResultsShareBlock
            game={game}
            players={players}
            words={words}
            numTeams={numTeams}
            mode={isIndividual ? 'individual' : 'team'}
            playerScores={playerScores}
          />
        )}
        {iWonDescribe && game && (
          <PostWinToCommunity
            gameType="describe_it"
            gameCode={gameCode}
            winnerName={myName || (myDescRow?.name ?? '')}
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
      </DescribeItShell>
    )
  }

  return (
    <DescribeItShell title={game?.title ?? cfg.label} compact wide={isIndividual}>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <DescribeItPlayPanel
          session={session}
          players={players}
          teamRows={teamPlain}
          words={words}
          guesses={guesses}
          myPlayerId={myPlayerId}
          secondsLeft={secondsLeft}
          breakLeft={breakLeft}
          urgent={urgent}
          onClue={isViewer ? undefined : (clue) => void sendAction('clue', { clue })}
          onGuess={isViewer ? undefined : (text) => void sendAction('guess', { text })}
          onSkip={isViewer ? undefined : () => void sendAction('skip', {})}
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
    </DescribeItShell>
  )
}
