'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { clampDescribeItTeams, isDescribeItResultsPhase } from '@/lib/describe-it'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  DESCRIBE_IT_SESSION_SELECT,
  DESCRIBE_IT_PLAYER_SELECT,
  DESCRIBE_IT_WORD_SELECT,
  DESCRIBE_IT_GUESS_SELECT,
} from '@/lib/supabase-selects'
import { setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { DescribeItGuess, DescribeItPlayer, DescribeItSession, DescribeItWord, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
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
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<DescribeItSession | null>(null)
  const [teamRows, setTeamRows] = useState<DescribeItPlayer[]>([])
  const [words, setWords] = useState<DescribeItWord[]>([])
  const [guesses, setGuesses] = useState<DescribeItGuess[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)
  const [picking, setPicking] = useState(false)

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const syncScreen = useCallback((g: Game, playerId: string | null, s: DescribeItSession | null) => {
    if (!playerId) {
      const pre = preJoinScreen(g, false)
      if (pre === 'game_started_waiting') return setScreen('game_started_waiting')
      if (pre === 'game_ended') return setScreen('game_ended')
      if (pre === 'late_join_choice') return setScreen('late_join_choice')
      return setScreen('join')
    }
    if (g.status === 'waiting') return setScreen('lobby')
    if (isDescribeItResultsPhase(g.status, s)) return setScreen('finished')
    if (g.status === 'active') return setScreen('active')
    setScreen('lobby')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false
    const gameData = gameRes.data
    if (!gameData) {
      setScreen('not_found')
      return true
    }
    setGame(gameData)
    setPlayers(plrsRes.data ?? [])

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
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as DescribeItSession | null) : null
    if (sessionData) setSession(sessionData)
    if (supabasePollOk(teamRes)) setTeamRows((teamRes.data ?? []) as DescribeItPlayer[])
    if (supabasePollOk(wordRes)) setWords((wordRes.data ?? []) as DescribeItWord[])
    if (supabasePollOk(guessRes)) setGuesses((guessRes.data ?? []) as DescribeItGuess[])

    const sess = await resolvePlayerSession(gameCode, plrsRes.data)
    const playerId = sess?.playerId ?? null
    setMyPlayerId(playerId)
    syncScreen(gameData, playerId, sessionData)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 80)
  }, [load])

  useEffect(() => {
    const channel = supabase.channel(`describe-it-player-${gameCode}`)
    for (const table of [
      'games',
      'players',
      'describe_it_sessions',
      'describe_it_players',
      'describe_it_words',
      'describe_it_guesses',
    ]) {
      const filter = table === 'games' ? `id=eq.${gameCode}` : `game_id=eq.${gameCode}`
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, scheduleLoad)
    }
    channel.subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const join = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toastError(data.error ?? 'Failed to join')
          return
        }
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinName, load, toastError]
  )

  const pickTeam = async (team: number) => {
    if (!myPlayerId) return
    setPicking(true)
    try {
      const res = await fetch('/api/describe-it/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, team }),
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
    setActing(true)
    try {
      const res = await fetch(`/api/describe-it/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
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
    void load()
  }

  const cfg = gameTypeConfig('describe_it')
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const numTeams = clampDescribeItTeams(game?.describe_it_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team }))

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
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="describe_it" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myPlayerId) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
            })
            await load()
          }}
          activity={
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
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    return (
      <DescribeItShell compact>
        {game && <DescribeItFinalResultsShareBlock game={game} players={players} words={words} numTeams={numTeams} />}
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
    <DescribeItShell title={game?.title ?? cfg.label} compact>
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
