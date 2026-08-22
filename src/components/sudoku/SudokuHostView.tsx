'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SudokuBoard } from '@/components/sudoku/SudokuBoard'
import { SudokuGameTimerBar } from '@/components/sudoku/SudokuGameTimerBar'
import { SudokuPlayerView } from '@/components/sudoku/SudokuPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseSudokuMetadata,
  tallySudokuScores,
  buildCellOwnerGrid,
  buildClaimedValueGrid,
  boardCompletionPercent,
  playerCompletionPercent,
  sudokuPlayerColor,
  SUDOKU_MIN_PLAYERS,
  getPlayerTimeSpent,
  type SudokuSubmission,
} from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { formatMinutesSeconds } from '@/lib/timer-format'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResults } from '@/components/ShareResults'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'

type HostTab = 'manage' | 'play'

export function SudokuHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const finishedCaptureRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [solution, setSolution] = useState<number[][] | null>(null)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [nowMs, setNowMs] = useState<number>(Date.now())

  useEffect(() => {
    if (game?.status === 'active') {
      const interval = setInterval(() => {
        setNowMs(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [game?.status])

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
        const meta = parseSudokuMetadata((roundData as Record<string, unknown>).sudoku_metadata)
        if (meta) setPuzzle(meta.puzzle)
        setRoundId(roundData.id as string)

        const { data: sol } = await supabase.rpc('sudoku_host_solution', {
          p_game_id: gameCode,
          p_host_token: hostToken,
        })
        if (Array.isArray(sol)) setSolution(sol as number[][])

        const { data: subs } = await supabase
          .from('sudoku_submissions')
          .select(SUDOKU_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        setSubmissions((subs ?? []) as SudokuSubmission[])
      }
    } else if (gameData.status === 'finished') {
      const { data: subs } = await supabase
        .from('sudoku_submissions')
        .select(SUDOKU_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as SudokuSubmission[])
    }
  }, [gameCode, hostToken])

  useEffect(() => {
    load()
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

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
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Realtime-fallback poll: keeps the lobby roster fresh (and catches missed
  // status transitions) when a players/games realtime event is dropped.
  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_host_game_${gameCode}`)
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
      .channel(`sudoku_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sudoku_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setSubmissions((prev) => {
            const exists = prev.some((s) => s.id === (payload.new as SudokuSubmission).id)
            return exists ? prev : [...prev, payload.new as SudokuSubmission]
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
      .channel(`sudoku_host_players_${gameCode}`)
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

  async function handleStart() {
    if (starting) return
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

  // "Play again · same settings" reopens the game into the ready-up ring; a plain
  // "Return to lobby" reset also drops the host's seat so they can re-pick play/host-only.
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
        const d = await res.json().catch(() => ({}))
        toastError(d.error || 'Failed to reset')
        return
      }
      // Return to lobby keeps the host seated: the play-again route re-seats the passed
      // hostPlayerId (resetSpectatorsForLobby(..., [hostPlayerId])), so clearing the local
      // session here would strand the host — their row stays in the roster while the UI
      // wrongly shows the "enter your name to join" form. Keep the session; the host can
      // leave the seat deliberately with the Host/Play toggle if they want to.
      if (!sameSettings) {
        setHostJoinName('')
      }
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

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const cellOwners = useMemo(() => buildCellOwnerGrid(submissions), [submissions])
  const claimedGrid = useMemo(() => (puzzle ? buildClaimedValueGrid(puzzle, submissions) : null), [puzzle, submissions])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = sudokuPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const leaderboard = tallySudokuScores(submissions, players)
  const hostSudokuRow = leaderboard.find((row) => row.player_id === hostPlayerId)
  // A solo game has no one to beat, so it's not a community-leaderboard win:
  // require more than one player in addition to the positive-score check.
  const hostWonSudoku =
    !!hostSudokuRow &&
    leaderboard.length > 1 &&
    leaderboard[0] != null &&
    hostSudokuRow === leaderboard[0] &&
    leaderboard[0].points > 0
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const boardCompletion = puzzle ? boardCompletionPercent(puzzle, cellOwners) : 0

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + How-to-play
  // + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="sudoku"
          onEnded={load}
          endGameConfirmMessage="Players will see the final results."
        >
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton
              onLeave={leaveSeatKeepHosting}
              canRejoin={false}
              className="btn-secondary w-full py-3 text-base"
            />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, setGame, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('sudoku')

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = <SudokuPlayerView gameCode={gameCode} />

  const watchBoard = (
    <div className="space-y-6">
      <SudokuGameTimerBar gameCode={gameCode} game={game} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Puzzle progress</p>
        <p className="text-2xl font-black">{boardCompletion}%</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {puzzle && (
          <SudokuBoard
            puzzle={puzzle}
            userGrid={claimedGrid ?? undefined}
            cellOwners={cellOwners}
            playerColors={playerColors}
            completionPercent={boardCompletion}
            readOnly
          />
        )}

        <div className="space-y-3">
          <p className="label-caps text-xs">Live scores</p>
          {leaderboard.map((row, i) => {
            const pct = puzzle ? playerCompletionPercent(puzzle, submissions, row.player_id) : 0
            const timeSecs = getPlayerTimeSpent(
              game,
              submissions,
              row.player_id,
              pct,
              nowMs,
              players.find((p) => p.id === row.player_id)?.joined_at
            )
            return (
              <div key={row.player_id} className="glass-card px-3 py-2.5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">
                    {i + 1}. {row.name}
                  </span>
                  <span className="text-xs text-muted block">
                    Completed: {pct}% · ⏱️ {formatMinutesSeconds(timeSecs)}
                  </span>
                </div>
                <span className="text-sm font-bold shrink-0">{row.points} pts</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="sudoku"
      top={
        game.status === 'waiting' ? (
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
            spectatorHint="Watch the puzzle"
          />
        ) : undefined
      }
      settings={
        game.status === 'waiting' ? (
          // "Before you start" panel: max players + late joiners (like other games).
          <HostSudokuLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            seatedCount={players.filter((p) => !p.spectator).length}
            onGameUpdate={setGame}
          />
        ) : (
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        )
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            game={game ?? undefined}
            onGameUpdate={setGame}
            onStart={() => void handleStart()}
            onEnded={load}
            canStart={activePlayers.length >= SUDOKU_MIN_PLAYERS}
            starting={starting}
            startLabel="Start puzzle"
            startDisabledHint={
              activePlayers.length >= SUDOKU_MIN_PLAYERS ? null : `Need at least ${SUDOKU_MIN_PLAYERS} players to start`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={14} />}
            confirmTitle="End this game?"
            confirmMessage="Players will see the final results."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
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
          minPlayers={SUDOKU_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void handleStart()}
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
  const canStart = activePlayers.length >= SUDOKU_MIN_PLAYERS

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
      spectatorHint="Watch the puzzle once it starts"
      playerHint="Solve the puzzle with everyone"
    />
  )

  const lobbySettings = (
    <>
      <HostSudokuLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={players.length}
        seatedCount={players.filter((p) => !p.spectator).length}
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
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('sudoku', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStart()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={canStart ? null : `Need at least ${SUDOKU_MIN_PLAYERS} players to start`}
        startLabel="Start puzzle"
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
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      noManageTab
      finished={
        <div className="space-y-4">
          <div ref={finishedCaptureRef} className="space-y-4">
            <FinishedWinnerHero winnerName={leaderboard[0]?.name} game={game} />
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => {
                const pct = puzzle ? playerCompletionPercent(puzzle, submissions, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  submissions,
                  row.player_id,
                  pct,
                  nowMs,
                  players.find((p) => p.id === row.player_id)?.joined_at
                )
                return {
                  id: row.player_id,
                  name: `${row.name} (⏱️ ${formatMinutesSeconds(timeSecs)})`,
                  score: row.points,
                  rank: i + 1,
                }
              })}
              scoreLabel={(n) => `${n} pts`}
              emphasizeLeader
            />
          </div>
          <HostGameFinishedActions
            variant="winner"
            gameCode={game.id}
            playAgainButton={
              <button
                type="button"
                onClick={() => void confirmPlayAgain()}
                disabled={playingAgain}
                className="btn-secondary w-full py-3 text-sm disabled:opacity-60"
              >
                {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
              </button>
            }
            returnToLobbyButton={
              <button
                type="button"
                onClick={() => void confirmReturnToLobby()}
                disabled={playingAgain}
                className="btn-secondary w-full py-3 text-sm disabled:opacity-60"
              >
                Return to lobby · different settings
              </button>
            }
            shareButton={
              <ShareResults
                captureRef={finishedCaptureRef}
                game={game}
                participants={[]}
                votes={[]}
                rounds={[]}
                players={players}
                primary
              />
            }
          />
          {hostWonSudoku && (
            <PostWinToCommunity
              gameType="sudoku"
              gameCode={gameCode}
              winnerName={hostSudokuRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </div>
      }
    />
  )
}
