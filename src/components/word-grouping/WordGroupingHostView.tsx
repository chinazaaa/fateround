'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, WORD_GROUPING_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostGameLayout, type HostTab } from '@/components/host/HostGameLayout'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { WordGroupingLobbySettings } from './WordGroupingLobbySettings'
import { TransferHostControl } from '@/components/TransferHostControl'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { useHostSeat } from '@/hooks/useHostSeat'
import { clearSoloAutoStart, setSoloAutoStart } from '@/lib/solo-auto-start'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useToast } from '@/components/ui/Toast'
import { gameTypeConfig } from '@/lib/game-types'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_TOTAL_GROUPS,
  WORD_GROUPING_GAME_DURATION_OPTIONS,
  tallyWordGroupingScores,
  wordGroupingFinishSeconds,
} from '@/lib/word-grouping'
import { WordGroupingPlayerView } from './WordGroupingPlayerView'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import type { Game, Player } from '@/types'

const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

interface Submission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  group_index: number
  difficulty: number
  guess_words: string[]
  is_correct: boolean
  mistakes_at_time: number
  submitted_at: string
}

interface SolutionGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

export function WordGroupingHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const cfg = gameTypeConfig('word_grouping')
  const { success, error: toastError } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [solution, setSolution] = useState<SolutionGroup[] | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  // HostGameLayout is a controlled tabs shell, but word_grouping has no host-run controls
  // beyond End game (surfaced in the header ⚙ gear), so we render with noManageTab and
  // this state stays stubbed — HostGameLayout still requires the prop pair.
  const [tab, setTab] = useState<HostTab>('play')

  const load = useCallback(async () => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (gameRes.data) setGame(gameRes.data as Game)
    if (plrsRes.data) setPlayers(plrsRes.data as Player[])

    const g = gameRes.data as Game | null
    if (g && (g.status === 'active' || g.status === 'finished')) {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        setRoundId(roundData.id)
        const { data: subs } = await supabase
          .from('word_grouping_submissions')
          .select(WORD_GROUPING_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        if (subs) setSubmissions(subs as Submission[])
      }

      if (g.status === 'finished') {
        const res = await fetch(`/api/word-grouping/solution?gameId=${gameCode}`)
        if (res.ok) {
          const { solution: sol } = await res.json()
          if (sol?.groups) setSolution(sol.groups)
        }
      }
    } else {
      // Play-again returns the room to `waiting`, and without an explicit reset the previous
      // session's `roundId` / `submissions` / `solution` linger — inflating roster scores and
      // stats until the game re-enters `active`. Clear them here so a fresh lobby is a fresh
      // slate.
      setRoundId(null)
      setSubmissions([])
      setSolution(null)
    }
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  const {
    hostMode,
    hostPlayerId,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    renameHost,
    leaveSeatKeepHosting,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
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
  // In-game host settings — surfaces late-joiner toggle + End Game + a "leave seat, keep hosting"
  // action when the host is playing along. Matches the shape word-scramble / crossword / sudoku
  // use. Gated on an active game so the sheet is only registered while there's something to
  // manage; waiting lobby has its own dedicated settings sheet.
  const hostSettingsNode = useMemo(
    () =>
      game && game.status === 'active' ? (
        <HostActiveSettings
          game={game}
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="word_grouping"
          onEnded={load}
          endGameConfirmMessage="Players will see the final results."
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

  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`wg_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          if (next.status !== gameStatusRef.current) load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [game, gameCode, load])

  useEffect(() => {
    if (!roundId) return
    const ch = supabase
      .channel(`wg_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'word_grouping_submissions',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => {
          const row = payload.new as Submission
          setSubmissions((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]))
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    if (game?.status !== 'active') return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [game?.status])

  const sessionElapsedSeconds = useMemo(() => {
    if (!game?.session_started_at) return 0
    return Math.floor((nowMs - new Date(game.session_started_at).getTime()) / 1000)
  }, [game?.session_started_at, nowMs])

  const timerSeconds = game?.game_duration_seconds ?? 0
  const timeRemaining = timerSeconds > 0 ? Math.max(0, timerSeconds - sessionElapsedSeconds) : null

  // Same retry-until-finished pattern as the player view — a single one-shot call at
  // timer=0 can hit the expire route's 5s clock-skew buffer and no-op, leaving the host on
  // the active screen until a manual refresh. Poll every 3s while local time is up so at
  // least one call lands after the buffer clears.
  const hostExpireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (game?.status !== 'active' || timeRemaining === null || timeRemaining > 0) {
      if (hostExpireIntervalRef.current) {
        clearInterval(hostExpireIntervalRef.current)
        hostExpireIntervalRef.current = null
      }
      return
    }
    if (hostExpireIntervalRef.current) return

    let cancelled = false
    const attempt = async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/expire-word-grouping`, { method: 'POST' })
        const data = (await res.json().catch(() => ({}))) as { finished?: boolean }
        if (cancelled) return
        await load()
        if (data.finished) {
          if (hostExpireIntervalRef.current) {
            clearInterval(hostExpireIntervalRef.current)
            hostExpireIntervalRef.current = null
          }
        }
      } catch {
        // Best-effort — the next tick retries.
      }
    }
    void attempt()
    hostExpireIntervalRef.current = setInterval(attempt, 3000)
    return () => {
      cancelled = true
      if (hostExpireIntervalRef.current) {
        clearInterval(hostExpireIntervalRef.current)
        hostExpireIntervalRef.current = null
      }
    }
  }, [game?.status, timeRemaining, gameCode, load])

  const rosterScores = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    const tally = tallyWordGroupingScores(playersArr, submissions)
    const out: Record<string, number> = {}
    for (const t of tally) out[t.id] = t.points
    return out
  }, [players, submissions])

  const rosterDetails = useMemo(() => {
    const out: Record<string, string> = {}
    for (const p of players) {
      const mySubs = submissions.filter((s) => s.player_id === p.id)
      const groups = mySubs.filter((s) => s.is_correct).length
      const mistakes = mySubs.filter((s) => !s.is_correct).length
      const done = groups >= WORD_GROUPING_TOTAL_GROUPS || mistakes >= WORD_GROUPING_MAX_MISTAKES
      out[p.id] = done ? `${groups}/4 ✓` : `${groups}/4`
    }
    return out
  }, [players, submissions])

  useGameScores(rosterScores, { suffix: ' pts' })
  useGameStats(rosterDetails)

  const leaderboardRows = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    return tallyWordGroupingScores(playersArr, submissions)
  }, [players, submissions])

  const handleStart = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      // Without surfacing the error, a failed start (invalid host token, too few ready
      // players, bad content) just clears the spinner and leaves the host staring at an
      // unchanged lobby with no explanation. Mirrors the `resetGame` error handling below.
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toastError(d.error || 'Failed to start game')
      }
    } catch {
      toastError('Failed to start game')
    } finally {
      setStarting(false)
    }
  }

  // Play again keeps the host seated (the play-again route re-seats the passed hostPlayerId),
  // so we never clear the local session here — only the join name when we drop back to lobby.
  async function resetGame(sameSettings: boolean) {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      // Solo replay: a 1-seat game reopened with the same settings should skip
      // the lobby just like the initial create — arm the auto-start flag before
      // the reset lands (useHostSeat consumes it once the host is re-seated in
      // 'waiting'). Return-to-lobby (sameSettings=false) never arms it.
      if (sameSettings && game?.max_players === 1) setSoloAutoStart(gameCode)
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      if (!res.ok) {
        // Don't leave a solo-replay flag armed for a reset that never landed —
        // otherwise a later Return-to-lobby would find it and unexpectedly start.
        clearSoloAutoStart(gameCode)
        const d = await res.json().catch(() => ({}))
        toastError(d.error || 'Failed to reset')
        return
      }
      if (!sameSettings) setHostJoinName('')
      await load()
    } catch (err) {
      // See the !res.ok branch above — same rationale for clearing the flag.
      clearSoloAutoStart(gameCode)
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message: 'Reopens the game with the same settings and a fresh puzzle. Everyone taps “ready” and you start again.',
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

  if (!game) return <HostLobbySkeleton />

  const lobbySettings = (
    <>
      <HostSudokuLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={players.length}
        onGameUpdate={setGame}
        durationChoices={WORD_GROUPING_GAME_DURATION_OPTIONS}
        puzzleSettings={
          <WordGroupingLobbySettings gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        }
      />
      <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
    </>
  )

  if (game.status === 'waiting') {
    return (
      <HostLobby
        gameCode={gameCode}
        questionSource={game.question_source}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('word_grouping', game) ?? game.max_players}
        settingsChildren={lobbySettings}
        playCard={
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
            spectatorHint="Watch the puzzle unfold"
            playerHint="Race to find the groups"
          />
        }
        onStart={handleStart}
        starting={starting}
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
      />
    )
  }

  // One winner per puzzle: the single top row after tiebreaks. Post the host's community
  // win only when the host is that row AND actually scored — a 0-point solo finish is not
  // a leaderboard result.
  const winner = leaderboardRows[0]
  const hostRow = leaderboardRows.find((row) => row.id === hostPlayerId)
  const hostWon =
    !!hostRow &&
    leaderboardRows.length > 1 &&
    leaderboardRows[0] != null &&
    hostRow === leaderboardRows[0] &&
    leaderboardRows[0].points > 0

  const hostPlays = hostMode === 'player' && !!hostPlayerId

  // Watch view for a host who isn't playing along. Rendered as HostGameLayout's `primary`
  // so the shared header + roster drawer (names, points, mistakes, Remove) wrap it, matching
  // every other puzzle game. The playing-host case still renders WordGroupingPlayerView directly.
  const watchBoard = (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Word Grouping — Live</h2>
        {timeRemaining !== null && (
          <span className={`font-bold tabular-nums ${timeRemaining <= 10 ? 'text-[var(--marry)]' : ''}`}>
            {formatMinutesSeconds(timeRemaining)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {players
          .filter((p) => !p.spectator)
          .map((p) => {
            const pSubs = submissions.filter((s) => s.player_id === p.id)
            const groups = pSubs.filter((s) => s.is_correct).length
            const mistakes = pSubs.filter((s) => !s.is_correct).length
            const done = groups >= WORD_GROUPING_TOTAL_GROUPS || mistakes >= WORD_GROUPING_MAX_MISTAKES
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted">
                  {groups}/4 groups · {mistakes} mistake{mistakes !== 1 ? 's' : ''}
                  {done && ' ✓'}
                </span>
              </div>
            )
          })}
      </div>

      <HostEndGameButton gameCode={gameCode} hostToken={hostToken} />
    </div>
  )

  // Host playing along: the player view is rendered as HostGameLayout's `primary` (not
  // returned above the layout) so the shared header + drawer's Remove action still wire up
  // via useRosterManage. Word Scramble uses the same shape.
  // `embedded` tells the player view not to register its own player-settings node — the host
  // chrome + this view's own hostSettingsNode are already what the ⚙ gear shows.
  const interactivePlay = <WordGroupingPlayerView gameCode={gameCode} embedded />

  const finishedScreen = (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <FinalResultsShareBlock
        game={game}
        participants={[]}
        votes={[]}
        rounds={[]}
        players={players}
        variant="winner"
        playAgainButton={
          <button
            type="button"
            onClick={() => void confirmPlayAgain()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-sm font-bold disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again'}
          </button>
        }
        returnToLobbyButton={
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-sm font-bold disabled:opacity-60"
          >
            Return to lobby
          </button>
        }
        lobbyNote="Play again keeps these settings · the lobby lets you change them first."
      >
        <FinishedWinnerHero winnerName={winner?.name} game={game} />
        <PaginatedLeaderboard
          title="Final Standings"
          rows={leaderboardRows.map((r, i) => {
            const secs = wordGroupingFinishSeconds(game?.session_started_at, r.lastAt)
            return {
              id: r.id,
              name: secs === null ? r.name : `${r.name} (⏱️ ${formatMinutesSeconds(secs)})`,
              score: r.points,
              rank: i + 1,
            }
          })}
          scoreLabel={(n) => `${n} pts`}
          emphasizeLeader
        />
      </FinalResultsShareBlock>

      {hostWon && (
        <PostWinToCommunity
          gameType="word_grouping"
          gameCode={gameCode}
          winnerName={winner?.name ?? ''}
          roundKey={game?.session_started_at ?? undefined}
        />
      )}

      {solution && (
        <div className="space-y-2">
          {[...solution]
            .sort((a, b) => a.difficulty - b.difficulty)
            .map((group) => (
              <div
                key={group.category}
                className="rounded-xl px-4 py-3 text-center"
                style={{ background: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1], color: '#1a1a1a' }}
              >
                <div className="font-bold uppercase tracking-wider text-sm">{group.category}</div>
                <div className="mt-1 font-medium text-sm">{group.words.join(', ')}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={hostPlays ? 'play' : 'watch'}
      game={game}
      players={players}
      hostPlayerId={hostPlayerId}
      onHostRejoined={load}
      onRemovePlayer={removePlayer}
      showTabs={game.status !== 'finished'}
      gameStarted={game.status === 'active'}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={watchBoard}
      noManageTab
      finished={finishedScreen}
      // The playing host's PlayerView already renders its own "Watching" banner; skip the
      // layout's copy so the two don't stack when the host is spectating a live seat.
      suppressViewerBanner={hostPlays}
    />
  )
}
