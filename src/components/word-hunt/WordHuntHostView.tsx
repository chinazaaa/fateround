'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { ExitIcon } from '@/components/host/host-icons'
import { HostWordHuntLobbyPanel } from '@/components/host-lobby/HostWordHuntLobbyPanel'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { WordHuntBoard } from '@/components/word-hunt/WordHuntBoard'
import { WordHuntPlayerView } from '@/components/word-hunt/WordHuntPlayerView'
import { WordHuntFinalResultsShareBlock } from '@/components/word-hunt/WordHuntFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { parseWordHuntMetadata, tallyWordHuntScores, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import { validWordsSetFromMetadata } from '@/lib/word-hunt-client'
import { useWordHuntGameTimer } from '@/hooks/useWordHuntGameTimer'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'

const WORD_HUNT_SUBMISSION_SELECT = 'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

type HostTab = 'manage' | 'play'

interface WordHuntSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  path: number[]
  points_awarded: number
  submitted_at: string
}

export function WordHuntHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [validWords, setValidWords] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useTurnNotifications({ status: game?.status })

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseWordHuntMetadata((roundData as Record<string, unknown>).word_hunt_metadata)
        if (meta) {
          setGrid(meta.grid)
          setValidWords(Array.from(validWordsSetFromMetadata(meta.valid_words)))
        }
        setRoundId(roundData.id as string)

        const { data: subs } = await supabase
          .from('word_hunt_submissions')
          .select(WORD_HUNT_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        setSubmissions((subs ?? []) as WordHuntSubmission[])
      }
    } else if (gameData.status === 'finished') {
      const [{ data: subs }, { data: roundData }] = await Promise.all([
        supabase.from('word_hunt_submissions').select(WORD_HUNT_SUBMISSION_SELECT).eq('game_id', gameCode),
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).eq('round_number', 1).maybeSingle(),
      ])
      setSubmissions((subs ?? []) as WordHuntSubmission[])
      if (roundData) {
        const meta = parseWordHuntMetadata((roundData as Record<string, unknown>).word_hunt_metadata)
        if (meta) {
          setGrid(meta.grid)
          setValidWords(Array.from(validWordsSetFromMetadata(meta.valid_words)))
        }
      }
    }
  }, [gameCode])

  const { label: timeLabel, timeUp, secondsLeft } = useWordHuntGameTimer(gameCode, game, load)

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
    leaveSeatKeepHosting,
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
      setHostJoinName('')
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved, setHostJoinName]
  )

  const { removingPlayerId, removePlayer } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useEffect(() => {
    load()
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Roster drawer scoreboard: points headline + words-found detail.
  const rosterScores = useMemo(
    () => Object.fromEntries(tallyWordHuntScores(submissions, players).map((r) => [r.player_id, r.points])),
    [submissions, players]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        tallyWordHuntScores(submissions, players).map((r) => [
          r.player_id,
          `✅ ${r.word_count} word${r.word_count === 1 ? '' : 's'}`,
        ])
      ),
    [submissions, players]
  )
  useGameStats(rosterDetails)

  // Realtime-fallback poll: keeps the lobby roster fresh (and catches missed
  // status transitions) when a players/games realtime event is dropped.
  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  useEffect(() => {
    const ch = supabase
      .channel(`word_hunt_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (!roundId) return
    const ch = supabase
      .channel(`word_hunt_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_hunt_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setSubmissions((prev) => {
            const exists = prev.some((s) => s.id === (payload.new as WordHuntSubmission).id)
            return exists ? prev : [...prev, payload.new as WordHuntSubmission]
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    const ch = supabase
      .channel(`word_hunt_host_players_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => {
          supabase
            .from('players')
            .select(PLAYER_SELECT)
            .eq('game_id', gameCode)
            .order('joined_at')
            .then(({ data }) => {
              if (data) setPlayers(data as Player[])
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode])

  async function startGame() {
    if (starting) return
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
      if (!res.ok) {
        const d = await res.json()
        toastError(d.error || 'Failed to start')
        return
      }
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } finally {
      setStarting(false)
    }
  }

  // "Play again · same settings" reopens the game as an open lobby flagged for the
  // ready-up ring; a plain reset (sameSettings=false) is the normal "Return to lobby".
  async function resetGame(sameSettings: boolean) {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toastError(data.error ?? 'Failed to reset game')
        return
      }
      if (!sameSettings) setHostJoinName('')
      setTab('manage')
      await load()
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

  const leaderboard = tallyWordHuntScores(submissions, players)
  const hostMySubmissions = hostPlayerId
    ? submissions.filter((submission) => submission.player_id === hostPlayerId)
    : undefined
  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length >= WORD_HUNT_MIN_PLAYERS
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const totalWords = submissions.length

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          game={game}
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="word_hunt"
          onEnded={load}
          endGameConfirmTitle="End this hunt early?"
          endGameConfirmMessage="The round will end and players will see the final scores."
        >
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('word_hunt')

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive play for a host-player.
  const interactivePlay = <WordHuntPlayerView gameCode={gameCode} />

  // Primary tab (host-only): read-only live board, progress, and leaderboard.
  const watchRound = game.status === 'active' && (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Words found</p>
          <p className="text-2xl font-black">{totalWords}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Time left</p>
          <p
            className={`text-xl font-black tabular-nums ${timeUp ? 'text-[var(--kill)]' : secondsLeft <= 10 ? 'text-[var(--marry)]' : 'text-[var(--primary)]'}`}
          >
            {timeLabel}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {grid && <WordHuntBoard grid={grid} selectedPath={[]} onPathChange={() => {}} disabled />}

        <div className="space-y-3">
          <p className="label-caps text-xs">Live scores</p>
          {leaderboard.map((row, i) => (
            <div key={row.player_id} className="glass-card px-3 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                {i + 1}. {row.name}
              </span>
              <span className="text-sm font-bold">
                {row.points} pts · {row.word_count}w
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={changeHostMode}
          onEditName={renameHost}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          spectatorHint="Watch the game"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="word_hunt" />}

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

      {game.status === 'waiting' && (
        <>
          <HostWordHuntLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            onGameUpdate={setGame}
          />
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            game={game ?? undefined}
            onGameUpdate={setGame}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startLabel="Start hunt"
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${WORD_HUNT_MIN_PLAYERS} players to start (${readyPlayers.length}/${WORD_HUNT_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        </>
      )}

      {game.status === 'active' && (
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={load}
          label="End game"
          icon={<ExitIcon size={14} />}
          confirmTitle="End this hunt early?"
          confirmMessage="The round will end and players will see the final scores."
          className="btn-danger-soft"
        />
      )}
    </div>
  )

  // A playing host counts as a community-leaderboard winner only with a genuine
  // (contested) win: top of the points board, more than one player, and a
  // positive score. Mirrors the player view and the other score-based games.
  const hostWordHuntRow = leaderboard.find((row) => row.player_id === hostPlayerId)
  const hostWon =
    hostPlays &&
    !!hostWordHuntRow &&
    leaderboard.length > 1 &&
    leaderboard[0] != null &&
    hostWordHuntRow === leaderboard[0] &&
    leaderboard[0].points > 0

  const finished = (
    <>
      <WordHuntFinalResultsShareBlock
        game={game}
        players={players}
        leaderboard={leaderboard}
        highlightPlayerId={hostPlayerId}
        mySubmissions={hostMySubmissions}
        allSubmissions={submissions}
        validWords={validWords.length > 0 ? validWords : undefined}
        playAgainButton={
          <button
            type="button"
            onClick={() => void confirmPlayAgain()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-base disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
        }
        returnToLobbyButton={
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
        }
        lobbyNote="Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first."
      />
      {hostWon && (
        <div className="mt-4">
          <PostWinToCommunity
            gameType="word_hunt"
            gameCode={gameCode}
            winnerName={hostWordHuntRow?.name ?? ''}
            roundKey={game?.session_started_at ?? undefined}
          />
        </div>
      )}
    </>
  )

  // "Play again · same settings" reopened the game as an open lobby flagged for the
  // ready-up ring — the host sees the ring + a "Start game" button instead of the lobby.
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={WORD_HUNT_MIN_PLAYERS}
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
      onEditName={renameHost}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void hostJoinGame()}
      joining={hostJoining}
      spectatorHint="Watch the game once it starts"
      playerHint="Play the hunt with everyone"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <HostWordHuntLobbyPanel
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
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('word_hunt', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${WORD_HUNT_MIN_PLAYERS} players to start (${readyPlayers.length}/${WORD_HUNT_MIN_PLAYERS})`
        }
        startLabel="Start hunt"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      />
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
      game={game}
      players={players}
      hostPlayerId={hostPlayerId}
      onHostRejoined={load}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={<div className="max-w-2xl mx-auto w-full">{hostPlays ? interactivePlay : watchRound}</div>}
      manage={manage}
      noManageTab={game?.status === 'active'}
      finished={finished}
    />
  )
}
