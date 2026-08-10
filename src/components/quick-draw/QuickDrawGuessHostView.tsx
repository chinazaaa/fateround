'use client'

import { useCallback, useEffect, useState } from 'react'
import { QuickDrawGuessPlayPanel } from '@/components/quick-draw/QuickDrawGuessPlay'
import { QuickDrawGuessFinishedResults } from '@/components/quick-draw/QuickDrawGuessFinishedResults'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostQuickDrawLobbyPanel } from '@/components/host-lobby/HostQuickDrawLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ExitIcon } from '@/components/host/host-icons'
import {
  QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL,
  QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM,
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
} from '@/lib/quick-draw-guess'
import { describeItLobbyReady } from '@/lib/describe-it'
import { playerIsViewer } from '@/lib/viewers'
import { appOrigin } from '@/lib/site'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  QUICK_DRAW_GUESS_GUESS_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  QUICK_DRAW_GUESS_SESSION_SELECT,
  QUICK_DRAW_GUESS_WORD_SELECT,
} from '@/lib/supabase-selects'
import type {
  QuickDrawGuessGuess,
  QuickDrawGuessPlayer,
  QuickDrawGuessSession,
  QuickDrawGuessWord,
  Game,
  Player,
} from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useQuickDrawGuessTimer } from '@/hooks/useQuickDrawGuessTimer'
import { useQuickDrawWord } from '@/hooks/useQuickDrawWord'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { DescribeItTeamRoster } from '@/components/describe-it/DescribeItChrome'

type HostTab = 'play' | 'manage'

export function QuickDrawGuessHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<QuickDrawGuessSession | null>(null)
  const [teamRows, setTeamRows] = useState<QuickDrawGuessPlayer[]>([])
  const [words, setWords] = useState<QuickDrawGuessWord[]>([])
  const [guesses, setGuesses] = useState<QuickDrawGuessGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [acting, setActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessRes, teamRes, wordRes, guessRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase
        .from('quick_draw_guess_sessions')
        .select(QUICK_DRAW_GUESS_SESSION_SELECT)
        .eq('game_id', gameCode)
        .maybeSingle(),
      supabase.from('quick_draw_guess_players').select(QUICK_DRAW_GUESS_PLAYER_SELECT).eq('game_id', gameCode),
      supabase.from('quick_draw_guess_words').select(QUICK_DRAW_GUESS_WORD_SELECT).eq('game_id', gameCode),
      supabase
        .from('quick_draw_guess_guesses')
        .select(QUICK_DRAW_GUESS_GUESS_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessRes, teamRes, wordRes, guessRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession((sessRes.data as QuickDrawGuessSession | null) ?? null)
    setTeamRows((teamRes.data ?? []) as QuickDrawGuessPlayer[])
    setWords((wordRes.data ?? []) as QuickDrawGuessWord[])
    setGuesses((guessRes.data ?? []) as QuickDrawGuessGuess[])
    return true
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [gameCode, load])

  const {
    hostMode,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveGameRemovePlayer,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
    onModeChange: (mode) => {
      if (mode === 'spectator') setTab('manage')
    },
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const connected = useGameTableSync(
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
  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const isIndividual = clampQuickDrawPlayMode(game?.quick_draw_play_mode) === 'individual'
  const numTeams = clampQuickDrawNumTeams(game?.quick_draw_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))
  const readyPlayers = players.filter((p) => p.spectator !== true)
  const minPlayers = isIndividual ? QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL : QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM
  const teamReady = isIndividual || describeItLobbyReady(teamPlain, numTeams).ok
  const hostMustJoinFirst = hostMode === 'player' && !hostPlayerId
  const canStart = readyPlayers.length >= minPlayers && teamReady && !hostMustJoinFirst

  const { secondsLeft, breakLeft, urgent } = useQuickDrawGuessTimer(gameCode, session, game?.status === 'active')

  // The secret prompt is no longer in the session read. A host-player pulls it through the route;
  // the host token is sent alongside the seat's resume token so the route can still resolve the
  // seat (games.host_player_id) if the resume token hasn't loaded yet. A watch-only host is never
  // the drawer, so this stays null for them.
  const myWord = useQuickDrawWord(gameCode, session, hostPlayerId, {
    resumeToken: hostResumeToken,
    hostToken,
  })

  const startGame = async () => {
    if (starting || !canStart) return
    if (hostMode === 'player' && !hostPlayerId) {
      toastError('Join with your name before starting (Host + play mode)')
      return
    }
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      success('Game started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const resetGame = async (sameSettings: boolean) => {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      if (data.game) setGame(data.game)
      setSession(null)
      setWords([])
      setGuesses([])
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
      await load()
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps “ready” and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
  }

  const assignTeam = async (playerId: string, team: number) => {
    const res = await fetch('/api/quick-draw/guess-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, hostToken, playerId, team }),
    })
    const data = await res.json()
    if (!res.ok) toastError(data.error ?? 'Failed to assign team')
    else await load()
  }

  const sendAction = async (path: string, body: Record<string, unknown>) => {
    if (!hostResumeToken || acting) return
    setActing(true)
    try {
      const res = await fetch(`/api/quick-draw/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) toastError(data.error ?? 'Action failed')
      else await load()
    } finally {
      setActing(false)
    }
  }

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('quick_draw')

  const hostPlayer = hostPlayerId ? (players.find((p) => p.id === hostPlayerId) ?? null) : null
  const hostReadOnly = hostPlayer ? playerIsViewer(hostPlayer, game) : true
  const hostPlays = hostMode === 'player' && !!hostPlayerId && !hostReadOnly
  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const playPanel = session && (
    <QuickDrawGuessPlayPanel
      gameCode={gameCode}
      session={session}
      players={players}
      teamRows={teamPlain}
      words={words}
      guesses={guesses}
      myPlayerId={hostPlays ? hostPlayerId : null}
      myWord={myWord}
      myResumeToken={hostPlays ? hostResumeToken : null}
      secondsLeft={secondsLeft}
      breakLeft={breakLeft}
      urgent={urgent}
      onGuess={hostPlays ? (text) => void sendAction('guess', { text }) : undefined}
      onSkip={hostPlays ? () => void sendAction('guess-skip', {}) : undefined}
      acting={acting}
    />
  )

  const interactivePlay =
    hostPlayerId &&
    (game.status === 'active' || game.status === 'finished' ? (
      playPanel
    ) : (
      <div className="glass-card p-6 text-center text-muted text-sm">Start the game to play from this tab.</div>
    ))

  const watchPanel =
    game.status === 'active' || game.status === 'finished' ? (
      <div className="space-y-4">
        {!hostPlayerId && (
          <div className="glass-card p-5 text-center space-y-2">
            <p className="font-bold">You&apos;re watching as host</p>
            <p className="text-muted text-sm">
              Switch to <strong className="text-body">Host + play</strong> in Manage and join with your name before the
              next game to draw and guess.
            </p>
          </div>
        )}
        {playPanel}
      </div>
    ) : (
      <div className="glass-card p-6 text-center space-y-2">
        <p className="font-bold">Watch mode</p>
        <p className="text-muted text-sm">
          Open {playerLink} on your phone to follow along, or switch to Host + play in Manage and join before you start.
        </p>
      </div>
    )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={changeHostMode}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          onEditName={renameHost}
          spectatorHint="Watch drawings from the Watch tab"
          playingNote={
            hostPlayerName ? (
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — draw and guess once you start.
              </p>
            ) : undefined
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="quick_draw" />}
      {game.status === 'waiting' && (
        <HostQuickDrawLobbyPanel
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          playerCount={players.length}
          onGameUpdate={setGame}
        />
      )}
      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}
      {game.status === 'waiting' && !isIndividual && (
        <DescribeItTeamRoster
          numTeams={numTeams}
          teamRows={teamPlain}
          players={players}
          myPlayerId={hostPlayerId}
          onPick={(team) => hostPlayerId && void assignTeam(hostPlayerId, team)}
          onMoveTeam={(playerId, team) => void assignTeam(playerId, team)}
        />
      )}
      {game.status === 'active' && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game controls</p>
          {hostMode === 'player' && !!hostPlayerId && !hostReadOnly && (
            <HostLeaveSeatButton
              onLeave={leaveGameRemovePlayer}
              variant="remove"
              className="btn-secondary w-full py-3 text-base"
            />
          )}
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
            className="btn-danger-soft"
          />
        </div>
      )}
      {game.status === 'waiting' && !game.replay_pending && (
        <HostLobbyWaitingFooter
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          onGameUpdate={setGame}
          onStart={() => void startGame()}
          onEnded={load}
          canStart={canStart}
          starting={starting}
          startDisabledHint={
            hostMustJoinFirst
              ? 'Join with your name first (Host + play mode)'
              : !canStart
                ? `Need at least ${minPlayers} players${isIndividual ? '' : ' with balanced teams'}`
                : null
          }
        />
      )}
    </div>
  )

  const finished = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      <QuickDrawGuessFinishedResults
        game={game}
        players={players}
        words={words}
        playerScores={teamPlain}
        highlightPlayerId={hostPlayerId}
        roundKey={session?.id}
        playAgainButton={
          <button
            type="button"
            disabled={playingAgain}
            onClick={() => void confirmPlayAgain()}
            className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
        }
        returnToLobbyButton={
          <button
            type="button"
            disabled={playingAgain}
            onClick={() => void confirmReturnToLobby()}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
        }
        lobbyNote="Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first."
      />
    </div>
  )

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={minPlayers}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() => void confirmReturnToLobby()}
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

  // Fresh lobby (not the play-again ready-up flow, handled above).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending

  const lobbyModeCard = (
    <HostModeSelector
      mode={hostMode}
      onChange={changeHostMode}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void hostJoinGame()}
      joining={hostJoining}
      onEditName={renameHost}
      spectatorHint="Watch drawings once it starts"
      playerHint="Draw and guess with everyone"
      playingNote={
        hostPlayerName ? (
          <p className="text-sm text-muted">
            Playing as <strong className="text-body">{hostPlayerName}</strong> — draw and guess once you start.
          </p>
        ) : undefined
      }
    />
  )

  const lobbyTeamRoster = !isIndividual ? (
    <DescribeItTeamRoster
      numTeams={numTeams}
      teamRows={teamPlain}
      players={players}
      myPlayerId={hostPlayerId}
      onPick={(team) => hostPlayerId && void assignTeam(hostPlayerId, team)}
      onMoveTeam={(playerId, team) => void assignTeam(playerId, team)}
    />
  ) : null

  const lobbySettings = (
    <>
      <HostQuickDrawLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={players.length}
        onGameUpdate={setGame}
      />
      <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
    </>
  )

  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        gameTypeLabel={cfg.label}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('quick_draw', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          hostMustJoinFirst
            ? 'Join with your name first (Host + play mode)'
            : !canStart
              ? `Need at least ${minPlayers} players${isIndividual ? '' : ' with balanced teams'}`
              : null
        }
        startLabel="Start game"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      >
        {lobbyTeamRoster}
      </HostLobby>
    )
  }

  return (
    <HostGameLayout
      onRemovePlayer={removePlayer}
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchPanel}
      manage={manage}
      finished={finished}
      game={game}
      players={players}
      hostPlayerId={hostPlayerId}
      onHostRejoined={load}
    />
  )
}
