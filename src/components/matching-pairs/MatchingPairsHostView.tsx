'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MatchingPairsPlayerView } from '@/components/matching-pairs/MatchingPairsPlayerView'
import { MatchingPairsGameTimerBar } from '@/components/matching-pairs/MatchingPairsGameTimerBar'
import {
  MatchingPairsStatDetails,
  MatchingPairsFinalBreakdown,
} from '@/components/matching-pairs/MatchingPairsStatDetails'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostMatchingPairsLobbyPanel } from '@/components/host-lobby/HostMatchingPairsLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseMatchingPairsMetadata,
  tallyMatchingPairsScore,
  formatMatchingPairsGridSize,
  buildCumulativeLeaderboard,
  type MatchingPairsLeaderboardRow,
  MATCHING_PAIRS_MIN_PLAYERS,
  type MatchingPairsSubmission,
  type MatchingPairsProgress,
  type MatchingPairsPlayerScore,
} from '@/lib/memory-match'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResults } from '@/components/ShareResults'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  MEMORY_MATCH_SUBMISSION_SELECT,
  MEMORY_MATCH_PROGRESS_SELECT,
} from '@/lib/supabase-selects'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { ROUND_RESULTS_AUTO_ADVANCE_SECONDS } from '@/lib/round-timing'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'

type HostTab = 'manage' | 'play'

export function MatchingPairsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const finishedCaptureRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<MatchingPairsSubmission[]>([])
  const [progressRows, setProgressRows] = useState<MatchingPairsProgress[]>([])
  const [gridSizePairs, setGridSizePairs] = useState<8 | 16>(8)
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)

  const [tab, setTab] = useState<HostTab>('manage')
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [roundEnded, setRoundEnded] = useState(false)
  const [startingNextRound, setStartingNextRound] = useState(false)
  const [autoAdvanceTick, setAutoAdvanceTick] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active' || gameData.status === 'finished') {
      const currentRoundNumber = (gameData as Game).current_round_number ?? 1
      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', currentRoundNumber)
        .maybeSingle()
      if (roundData) {
        setRoundId(roundData.id)
        setRoundStartedAt(roundData.started_at)
        setRoundEnded(roundData.status === 'finished')
        const meta = parseMatchingPairsMetadata(roundData.memory_match_metadata)
        if (meta) setGridSizePairs(meta.gridSizePairs)

        const [{ data: subData }, { data: progData }] = await Promise.all([
          supabase.from('memory_match_submissions').select(MEMORY_MATCH_SUBMISSION_SELECT).eq('game_id', gameCode),
          supabase.from('memory_match_progress').select(MEMORY_MATCH_PROGRESS_SELECT).eq('game_id', gameCode),
        ])
        setSubmissions((subData ?? []) as MatchingPairsSubmission[])
        setProgressRows((progData ?? []) as MatchingPairsProgress[])
      } else {
        setRoundEnded(false)
      }
    } else {
      setRoundEnded(false)
    }
  }, [gameCode])

  const handleStartNextRound = useCallback(async () => {
    if (startingNextRound) return
    setStartingNextRound(true)
    setAutoAdvanceTick(null)
    try {
      const res = await fetch('/api/matching-pairs/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toastError(d.error ?? 'Failed to start next round')
      } else {
        setRoundEnded(false)
        await load()
      }
    } finally {
      setStartingNextRound(false)
    }
  }, [gameCode, hostToken, load, toastError, startingNextRound])

  useEffect(() => {
    if (game?.status === 'active') {
      const interval = setInterval(() => {
        setNowMs(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [game?.status])

  useTurnNotifications({ status: game?.status })

  // Auto-advance countdown for the next round.
  // Defer the initial setState via setTimeout(0) so it runs in a callback
  // rather than synchronously in the effect body, satisfying the lint rule.
  useEffect(() => {
    if (!roundEnded || startingNextRound) return
    const totalRounds = game?.rounds_count ?? 1
    const currentRoundNumber = game?.current_round_number ?? 1
    if (currentRoundNumber >= totalRounds) return // last round — no auto-advance

    let count = ROUND_RESULTS_AUTO_ADVANCE_SECONDS

    const init = setTimeout(() => setAutoAdvanceTick(count), 0)
    const t = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(t)
        setAutoAdvanceTick(0)
        if (game?.status === 'active') void handleStartNextRound()
      } else {
        setAutoAdvanceTick(count)
      }
    }, 1000)

    return () => {
      clearTimeout(init)
      clearInterval(t)
    }
  }, [
    roundEnded,
    startingNextRound,
    game?.rounds_count,
    game?.current_round_number,
    game?.status,
    handleStartNextRound,
  ])

  useEffect(() => {
    void load()
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime: subscribe to progress changes for live opponent view.
  // Apply optimistically from the realtime payload — no need to call load()
  // (which re-fetches everything), since the payload contains the full row.
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`mp_host_progress_${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_match_progress', filter: `round_id=eq.${roundId}` },
        (payload) => {
          // Optimistic local update so the host's progress bar reacts instantly.
          const updated = payload.new as import('@/lib/memory-match').MatchingPairsProgress
          setProgressRows((prev) => {
            // Use composite key (round_id, player_id) so a later round's update
            // cannot overwrite an earlier round's row when all rounds coexist.
            const idx = prev.findIndex((p) => p.round_id === updated.round_id && p.player_id === updated.player_id)
            if (idx >= 0) {
              // Reject stale updates — an older payload arriving after a newer one
              // (due to network timing) must not regress the displayed state.
              const existing = prev[idx]
              if (existing.updated_at >= updated.updated_at) return prev
              const next = [...prev]
              next[idx] = updated
              return next
            }
            return [...prev, updated]
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roundId])

  // Realtime: round transitions (round ended → round results, new round → playing).
  useEffect(() => {
    if (!gameCode) return
    const channel = supabase
      .channel(`mp_host_rounds_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  const {
    hostMode: hostModeState,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame: handleJoinAsPlayer,
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

  const handleStartGame = useCallback(async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toastError(d.error ?? 'Failed to start game')
      } else {
        await load()
        if (hostModeState === 'player' && hostPlayerId) setTab('play')
      }
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, load, toastError, hostModeState, hostPlayerId])

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
      // The play-again POST carries hostPlayerId so the server keeps the host's
      // seat (resetSpectatorsForLobby); useHostSeat retains that seat in its own
      // state and only drops it via reconciliation if the row truly disappears.
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

  // Per-round leaderboard from the current round's submissions + progress.
  // Ranked by final score descending (primary), then finish rank as tiebreaker.
  const leaderboard = useMemo<MatchingPairsPlayerScore[]>(() => {
    if (!roundId) return []
    const roundProgress = progressRows.filter((p) => p.round_id === roundId)
    if (!roundProgress.length) return []
    const roundSubmissions = submissions.filter((s) => s.round_id === roundId)
    return roundProgress
      .map((prog) => {
        const playerSubs = roundSubmissions.filter((s) => s.player_id === prog.player_id)
        return tallyMatchingPairsScore(
          playerSubs,
          prog,
          gridSizePairs,
          game?.session_started_at,
          roundStartedAt,
          game?.timer_seconds
        )
      })
      .sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
        const rankA = a.placement ?? 999
        const rankB = b.placement ?? 999
        if (rankA !== rankB) return rankA - rankB
        return (a.wrongAttempts ?? 0) - (b.wrongAttempts ?? 0)
      })
  }, [submissions, progressRows, roundId, gridSizePairs, game?.session_started_at])

  const playerMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.id, p.name)
    return m
  }, [players])

  // Build a map of round_id → started_at from progress rows so the cumulative
  // leaderboard can pass per-round start times to tallyMatchingPairsScore.
  const roundStartedAtMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of progressRows) {
      if (p.created_at && !m.has(p.round_id)) m.set(p.round_id, p.created_at)
    }
    return m
  }, [progressRows])

  // Cumulative leaderboard across all completed rounds — determines final ranking.
  const cumulativeLeaderboard = useMemo<MatchingPairsLeaderboardRow[]>(() => {
    if (!submissions.length && !progressRows.length) return []
    return buildCumulativeLeaderboard(
      submissions,
      progressRows,
      playerMap,
      gridSizePairs,
      game?.session_started_at ?? null,
      roundStartedAtMap,
      game?.timer_seconds
    )
  }, [
    submissions,
    progressRows,
    playerMap,
    gridSizePairs,
    game?.session_started_at,
    roundStartedAtMap,
    game?.timer_seconds,
  ])

  const hostWonMp =
    cumulativeLeaderboard.length > 1 &&
    cumulativeLeaderboard[0]?.playerId === hostPlayerId &&
    cumulativeLeaderboard[0]?.finalScore > 0

  const winnerId = cumulativeLeaderboard[0]?.playerId
  const isHostWinner = !!winnerId && winnerId === hostPlayerId
  const winnerName = isHostWinner ? hostPlayerName : winnerId ? (playerMap.get(winnerId) ?? winnerId) : 'Someone'

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + How-to-play
  // + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings gameCode={gameCode} hostToken={hostToken} gameType="matching_pairs" onEnded={load}>
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostModeState === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, setGame, leaveSeatKeepHosting, hostModeState, hostPlayerId]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('matching_pairs')

  const activePlayers = players.filter((p) => !p.spectator)
  const hostPlays = hostModeState === 'player' && !!hostPlayerId
  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'
  const currentRoundNumber = game.current_round_number ?? 1
  const totalRounds = game.rounds_count ?? 1
  const isLastRound = currentRoundNumber >= totalRounds

  const interactivePlay = <MatchingPairsPlayerView gameCode={gameCode} />

  const roundResultsUI = (
    <section className="space-y-4" style={{ padding: '0 0 16px', textAlign: 'center' }}>
      <div className="glass-card-strong p-8 space-y-2">
        <p className="text-3xl">🏁</p>
        <p className="text-xl font-black">
          Round {currentRoundNumber}/{totalRounds} complete!
        </p>
        {!isLastRound && autoAdvanceTick !== null && autoAdvanceTick >= 0 && (
          <p className="text-sm text-muted">
            Next round starts in{' '}
            <span className={`font-black tabular-nums text-body ${autoAdvanceTick > 0 ? 'animate-pulse' : ''}`}>
              {autoAdvanceTick}
            </span>
            ...
          </p>
        )}
      </div>

      {cumulativeLeaderboard.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted">Cumulative standings</p>
          {cumulativeLeaderboard.map((row, i) => (
            <div
              key={row.playerId}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] px-4 py-2.5 text-sm"
            >
              <span>
                <strong>#{i + 1}</strong> {row.name}
              </span>
              <span className="font-bold tabular-nums">{row.finalScore.toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      )}

      <PaginatedLeaderboard
        title="Round standings"
        rows={leaderboard.map((s, i) => ({
          id: s.playerId,
          rank: i + 1,
          name: playerMap.get(s.playerId) ?? 'Unknown',
          score: s.finalScore,
          correctCount: s.pairsMatched,
          expandDetails: <MatchingPairsStatDetails score={s} gridSizePairs={gridSizePairs} />,
        }))}
        totalQuestions={gridSizePairs}
        scoreLabel={(n) => `${n} pts`}
        emphasizeLeader
      />
      {isLastRound ? (
        <p className="text-sm text-muted py-2">Final results coming up...</p>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleStartNextRound()}
            disabled={startingNextRound}
            className="btn-primary w-full py-3 text-base font-bold disabled:opacity-60"
          >
            {startingNextRound ? 'Starting...' : `→ Start Round ${currentRoundNumber + 1}`}
          </button>
        </div>
      )}
    </section>
  )

  const memorizeSeconds = gridSizePairs >= 16 ? 5 : 3
  const playStartMs = game?.session_started_at
    ? new Date(game.session_started_at).getTime() + memorizeSeconds * 1000
    : 0
  const getPlayerElapsedSecs = (prog: MatchingPairsProgress): number => {
    if (prog.finished && prog.finished_at) {
      const endMs = new Date(prog.finished_at).getTime()
      return Math.max(0, Math.floor((endMs - playStartMs) / 1000))
    }
    if (playStartMs > 0) {
      return Math.max(0, Math.floor((nowMs - playStartMs) / 1000))
    }
    return 0
  }

  const roundIndicator =
    totalRounds > 1 ? (
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>
        Round {currentRoundNumber}/{totalRounds}
      </div>
    ) : null

  const watchBoard = (
    <section className="space-y-4" style={{ padding: '0 0 16px' }}>
      <MatchingPairsGameTimerBar gameCode={gameCode} game={game} roundStartedAt={roundStartedAt} />
      {roundIndicator}
      <p style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 8 }}>
        Live progress — {formatMatchingPairsGridSize(gridSizePairs)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {progressRows
          .filter((p) => p.round_id === roundId)
          .sort((a, b) => b.pairs_matched - a.pairs_matched)
          .map((prog) => {
            const name = playerMap.get(prog.player_id) ?? 'Unknown'
            const pct = Math.round((prog.pairs_matched / gridSizePairs) * 100)
            const elapsedSecs = getPlayerElapsedSecs(prog)
            return (
              <div
                key={prog.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--surface)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14, minWidth: 120 }}>{name}</span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'var(--border-strong)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: prog.finished ? '#22c55e' : '#f59e0b',
                      borderRadius: 99,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    minWidth: 80,
                    textAlign: 'right',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {prog.finished ? '✓ Done' : `${prog.pairs_matched}/${gridSizePairs}`}
                  <br />
                  <span style={{ fontSize: 10 }}>⏱️ {formatMinutesSeconds(elapsedSecs)}</span>
                </span>
              </div>
            )
          })}
      </div>
    </section>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="matching_pairs"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostModeState}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void handleJoinAsPlayer()}
            joining={hostJoining}
            onEditName={renameHost}
          />
        ) : undefined
      }
      settings={
        game.status === 'waiting' ? (
          <HostMatchingPairsLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={activePlayers.length}
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
            onStart={() => void handleStartGame()}
            onEnded={load}
            canStart={activePlayers.length >= 1}
            starting={starting}
            startLabel="Start game"
            startDisabledHint={activePlayers.length >= 1 ? null : 'Need at least 1 player to start'}
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={14} />}
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
          minPlayers={MATCHING_PAIRS_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void handleStartGame()}
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
  const canStart = activePlayers.length >= 1

  const lobbyModeCard = (
    <HostModeSelector
      mode={hostModeState}
      onChange={changeHostMode}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void handleJoinAsPlayer()}
      joining={hostJoining}
      onEditName={renameHost}
      spectatorHint="Watch the game once it starts"
      playerHint="Play the memory match with everyone"
    />
  )

  const lobbySettings = (
    <>
      <HostMatchingPairsLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={activePlayers.length}
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
        maxPlayers={lobbyMaxPlayersFromGameClient('matching_pairs', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStartGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={canStart ? null : 'Need at least 1 player to start'}
        startLabel="Start game"
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
      primary={hostPlays ? interactivePlay : roundEnded ? roundResultsUI : watchBoard}
      manage={manage}
      noManageTab
      finished={
        <div className="space-y-4">
          <div ref={finishedCaptureRef} className="space-y-4">
            <FinishedWinnerHero
              winnerName={winnerName}
              game={game}
              headline={
                hostWonMp ? (
                  <>
                    <span className="gradient-title">You</span> won!
                  </>
                ) : undefined
              }
              stats={[
                {
                  value: (cumulativeLeaderboard[0]?.finalScore ?? 0).toLocaleString(),
                  label: 'Points total',
                },
              ]}
            />
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={cumulativeLeaderboard.map((row, i) => ({
                id: row.playerId,
                rank: i + 1,
                name: row.name,
                score: row.finalScore,
                correctCount: row.pairsMatched,
                expandDetails: (
                  <MatchingPairsFinalBreakdown
                    playerId={row.playerId}
                    allSubmissions={submissions}
                    allProgress={progressRows}
                    gridSizePairs={gridSizePairs}
                    sessionStartedAt={game?.session_started_at ?? null}
                    roundStartedAtMap={roundStartedAtMap}
                    totalRounds={totalRounds}
                    timerSeconds={game?.timer_seconds ?? null}
                  />
                ),
              }))}
              totalQuestions={gridSizePairs * totalRounds}
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
          {hostWonMp && (
            <PostWinToCommunity
              gameType="matching_pairs"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </div>
      }
    />
  )
}
