'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { WordScrambleGameTimerBar } from '@/components/word-scramble/WordScrambleGameTimerBar'
import { WordScramblePlayerView } from '@/components/word-scramble/WordScramblePlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { HostPuzzleSettings } from '@/components/host-lobby/HostPuzzleSettings'
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
  parseWordScrambleMetadata,
  tallyWordScrambleScores,
  wordScrambleCompletionPercent,
  WORD_SCRAMBLE_MIN_PLAYERS,
  WORD_SCRAMBLE_GAME_DURATION_OPTIONS,
  type WordScrambleMetadata,
  type WordScrambleSolve,
  type WordScrambleHint,
} from '@/lib/word-scramble'
import { getPlayerTimeSpent } from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { formatMinutesSeconds } from '@/lib/timer-format'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'

const SOLVE_SELECT = 'id,game_id,round_id,player_id,scramble_index,word,via_hint,solved_at'
const HINT_SELECT = 'player_id,scramble_index,letters'

type HostTab = 'manage' | 'play'

function solvesAsTimeRows(solves: WordScrambleSolve[]) {
  return solves.map((s) => ({
    player_id: s.player_id,
    is_correct: true,
    cell_row: 0,
    cell_col: 0,
    submitted_at: s.solved_at,
  }))
}

export function WordScrambleHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<WordScrambleMetadata | null>(null)
  const [solves, setSolves] = useState<WordScrambleSolve[]>([])
  const [hints, setHints] = useState<WordScrambleHint[]>([])
  const [answers, setAnswers] = useState<string[] | null>(null)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [nowMs, setNowMs] = useState<number>(Date.now())

  useEffect(() => {
    if (game?.status === 'active') {
      const interval = setInterval(() => setNowMs(Date.now()), 1000)
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

    if (gameData.status === 'active' || gameData.status === 'finished') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, word_scramble_metadata')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseWordScrambleMetadata((roundData as Record<string, unknown>).word_scramble_metadata)
        if (meta) setMetadata(meta)
        setRoundId(roundData.id as string)
      }
      const { data: rows } = await supabase.from('word_scramble_solves').select(SOLVE_SELECT).eq('game_id', gameCode)
      setSolves((rows ?? []) as WordScrambleSolve[])
      const { data: hintRows } = await supabase.from('word_scramble_hints').select(HINT_SELECT).eq('game_id', gameCode)
      setHints((hintRows ?? []) as WordScrambleHint[])
    }
  }, [gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (game?.status !== 'finished' || answers) return
    let cancelled = false
    fetch(`/api/word-scramble/solution?gameId=${gameCode.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && Array.isArray(j?.answers)) setAnswers(j.answers as string[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [game?.status, answers, gameCode])

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
  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Latest committed status, read by the games channel without resubscribing.
  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`word_scramble_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          // Reload only on a status flip; finish writes the games row several times and
          // reloading on each replayed the finish cascade (the host's "glitches several times").
          if (next.status !== gameStatusRef.current) load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (!roundId) return
    // Many players ⇒ a solve INSERT per player per word. Applying each as its own setState re-renders
    // the whole host board per event. Buffer and flush in one update a few times a second instead.
    const pending: WordScrambleSolve[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      setSolves((prev) => {
        const ids = new Set(prev.map((s) => s.id))
        const add = batch.filter((r) => (ids.has(r.id) ? false : (ids.add(r.id), true)))
        return add.length ? [...prev, ...add] : prev
      })
    }
    const ch = supabase
      .channel(`word_scramble_host_solves_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_scramble_solves', filter: `round_id=eq.${roundId}` },
        (payload) => {
          pending.push(payload.new as WordScrambleSolve)
          if (!flushTimer) flushTimer = setTimeout(flush, 200)
        }
      )
      .subscribe()
    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    const ch = supabase
      .channel(`word_scramble_host_players_${gameCode}`)
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
      message: 'Reopens the game with the same settings. Everyone taps “ready” and you start the next race.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message: 'Sends everyone back to the game lobby where you can tweak settings before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
  }

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const leaderboard = useMemo(
    () => (metadata ? tallyWordScrambleScores(metadata, solves, players, { hints }) : []),
    [metadata, solves, players, hints]
  )
  const hostRow = leaderboard.find((row) => row.player_id === hostPlayerId)
  const hostWon =
    !!hostRow &&
    leaderboard.length > 1 &&
    leaderboard[0] != null &&
    hostRow === leaderboard[0] &&
    leaderboard[0].points > 0
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + How-to-play
  // + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="word_scramble"
          onEnded={load}
          endGameConfirmMessage="Players will see the final results."
        >
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, setGame, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('word_scramble')

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = <WordScramblePlayerView gameCode={gameCode} />

  const watchBoard = (
    <div className="space-y-5">
      <WordScrambleGameTimerBar gameCode={gameCode} game={game} onExpired={load} />
      <p className="label-caps text-xs">Live scores</p>
      {leaderboard.length === 0 ? (
        <p className="text-sm text-muted">No players yet.</p>
      ) : (
        leaderboard.map((row, i) => {
          const pct = metadata ? wordScrambleCompletionPercent(metadata, solves, row.player_id) : 0
          const timeSecs = getPlayerTimeSpent(
            game,
            solvesAsTimeRows(solves),
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
                  {row.solved}/{metadata?.count ?? 0} solved · {pct}% · ⏱️ {formatMinutesSeconds(timeSecs)}
                </span>
              </div>
              <span className="text-sm font-bold shrink-0">{row.points} pts</span>
            </div>
          )
        })
      )}
    </div>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="word_scramble"
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
            spectatorHint="Watch the race from the Watch tab"
          />
        ) : undefined
      }
      settings={
        game.status === 'waiting' ? (
          <HostSudokuLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            onGameUpdate={setGame}
            durationChoices={WORD_SCRAMBLE_GAME_DURATION_OPTIONS}
            puzzleSettings={
              <HostPuzzleSettings
                gameCode={gameCode}
                hostToken={hostToken}
                game={game}
                onGameUpdate={setGame}
                kind="word_scramble"
              />
            }
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
            canStart={activePlayers.length >= WORD_SCRAMBLE_MIN_PLAYERS}
            starting={starting}
            startLabel="Start race"
            startDisabledHint={
              activePlayers.length >= WORD_SCRAMBLE_MIN_PLAYERS
                ? null
                : `Need at least ${WORD_SCRAMBLE_MIN_PLAYERS} player${WORD_SCRAMBLE_MIN_PLAYERS === 1 ? '' : 's'} to start`
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

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={WORD_SCRAMBLE_MIN_PLAYERS}
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
  const canStart = activePlayers.length >= WORD_SCRAMBLE_MIN_PLAYERS

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
      spectatorHint="Watch the race once it starts"
      playerHint="Race to unscramble with everyone"
    />
  )

  const lobbySettings = (
    <>
      <HostSudokuLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={players.length}
        onGameUpdate={setGame}
        durationChoices={WORD_SCRAMBLE_GAME_DURATION_OPTIONS}
        puzzleSettings={
          <HostPuzzleSettings
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            onGameUpdate={setGame}
            kind="word_scramble"
          />
        }
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
        maxPlayers={lobbyMaxPlayersFromGameClient('word_scramble', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStart()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${WORD_SCRAMBLE_MIN_PLAYERS} player${WORD_SCRAMBLE_MIN_PLAYERS === 1 ? '' : 's'} to start`
        }
        startLabel="Start race"
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
        <>
          <FinalResultsShareBlock
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            playAgainButton={
              <button
                type="button"
                onClick={() => void confirmPlayAgain()}
                disabled={playingAgain}
                className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
              >
                {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
              </button>
            }
          >
            <FinishedWinnerHero winnerName={leaderboard[0]?.name} game={game} />
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => {
                const pct = metadata ? wordScrambleCompletionPercent(metadata, solves, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  solvesAsTimeRows(solves),
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
          </FinalResultsShareBlock>
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
          {hostWon && (
            <PostWinToCommunity
              gameType="word_scramble"
              gameCode={gameCode}
              winnerName={hostRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
          {answers && (
            <div className="glass-card p-4 space-y-2">
              <p className="label-caps text-xs">Answers</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {answers.map((a, i) => (
                  <p key={i} className="text-sm">
                    <span className="text-muted tabular-nums">{i + 1}.</span>{' '}
                    <span className="font-bold text-[var(--foreground)]">{a}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      }
    />
  )
}
