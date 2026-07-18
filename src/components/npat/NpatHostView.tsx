'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { NpatActiveRound } from '@/components/npat/NpatActiveRound'
import { NpatFinalResultsShareBlock } from '@/components/npat/NpatFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostMaxPlayersLobbyPanel } from '@/components/host-lobby/HostMaxPlayersLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { useNpatAdvance } from '@/hooks/useNpatAdvance'
import {
  clampNpatMarkingTimer,
  clampNpatTimer,
  formatNpatGameDuration,
  NPAT_GAME_DURATION_OPTIONS,
  NPAT_MARKING_TIMER_OPTIONS,
  NPAT_MIN_PLAYERS,
  NPAT_TIMER_OPTIONS,
  parseNpatMetadata,
  resolveActiveNpatRound,
  tallyNpatScores,
} from '@/lib/npat'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, NPAT_ANSWER_SELECT, NPAT_MARK_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { Game, NpatAnswer, NpatMark, Player, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'

type HostTab = 'play' | 'manage'

export function NpatHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<NpatAnswer[]>([])
  const [marks, setMarks] = useState<NpatMark[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingTimer, setSavingTimer] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [markingTimerSeconds, setMarkingTimerSeconds] = useState(45)
  const [gameDurationSeconds, setGameDurationSeconds] = useState(0)
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })
  useTurnNotifications({ status: game?.status })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, ansRes, marksRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('npat_answers').select(NPAT_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('npat_marks').select(NPAT_MARK_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, ansRes, marksRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setTimerSeconds(gameRes.data.timer_seconds ?? 60)
      setMarkingTimerSeconds(gameRes.data.operative_timer_seconds ?? 45)
      setGameDurationSeconds(gameRes.data.game_duration_seconds ?? 0)
    }
    setPlayers(plrsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setAnswers(ansRes.data ?? [])
    setMarks(marksRes.data ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
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

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'npat_answers', 'npat_marks'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  useNpatAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  const currentRound = useMemo(() => {
    if (!game) return null
    return resolveActiveNpatRound(rounds, game.current_round_number)
  }, [rounds, game])

  const currentMetadata = currentRound ? parseNpatMetadata(currentRound.npat_metadata) : null

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const startGame = async () => {
    setStarting(true)
    try {
      const saveRes = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          timer_seconds: timerSeconds,
          operative_timer_seconds: markingTimerSeconds,
          game_duration_seconds: gameDurationSeconds,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error ?? 'Failed to save timers')

      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveTimers = async () => {
    setSavingTimer(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          timer_seconds: timerSeconds,
          operative_timer_seconds: markingTimerSeconds,
          game_duration_seconds: gameDurationSeconds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save timers')
      if (data.game) setGame(data.game)
      success('Timers updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save timers')
    } finally {
      setSavingTimer(false)
    }
  }

  const resetGame = async (sameSettings: boolean) => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      setRounds([])
      setAnswers([])
      setMarks([])
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

  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const canStart = players.length >= NPAT_MIN_PLAYERS

  const currentRoundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const currentRoundMarks = useMemo(
    () => (currentRound ? marks.filter((m) => m.round_id === currentRound.id) : []),
    [marks, currentRound]
  )
  const leaderboard = useMemo(() => tallyNpatScores(answers, players), [answers, players])
  const hostNpatRow = leaderboard.find((row) => row.id === hostPlayerId)
  const hostWonNpat =
    !!hostNpatRow && leaderboard[0] != null && hostNpatRow === leaderboard[0] && leaderboard[0].score > 0
  const showManageScoreboard =
    game?.status === 'active' &&
    currentMetadata != null &&
    (currentMetadata.phase === 'writing' ||
      currentMetadata.phase === 'marking' ||
      currentMetadata.phase === 'host_review' ||
      currentMetadata.phase === 'reveal')

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('i_call_on')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const playerManageBlock =
    game.status === 'waiting' || game.status === 'active' ? (
      <HostLobbyPlayersSection
        players={players}
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        alwaysShowReady={game.status === 'waiting'}
      />
    ) : null

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={NPAT_MIN_PLAYERS}
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

  // Primary tab: interactive round for a host-player, read-only gameplay for a host-only host.
  const interactivePlay = hostPlays && hostPlayerId && game.status === 'active' && (
    <NpatActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      answers={answers}
      marks={marks}
      myPlayerId={hostPlayerId}
      myResumeToken={hostResumeToken}
      playerName={hostPlayerName}
      onReload={load}
      skipGameSync
    />
  )

  const watchRound = game.status === 'active' && (
    <div className="space-y-4">
      <PaginatedLeaderboard
        title="Leaderboard"
        rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
        highlightId={hostPlayerId}
        scoreLabel={(score) => `${score} pts`}
      />
      {showManageScoreboard && currentMetadata && (
        <NpatScoreboard
          letter={currentMetadata.letter}
          players={players}
          answers={currentRoundAnswers}
          marks={currentRoundMarks}
          metadata={currentMetadata}
          showScores={currentMetadata.scores_computed || currentMetadata.phase === 'reveal'}
          maskAnswers={currentMetadata.phase === 'writing'}
        />
      )}
    </div>
  )

  const manage = (
    <div className="space-y-4">
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
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play from the Play tab once you
              start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="i_call_on" />}

      {game.status === 'waiting' && (
        <>
          {playerManageBlock}

          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
            <p className="label-caps">Game settings</p>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Game length</span>
              <select
                value={gameDurationSeconds}
                onChange={(e) => setGameDurationSeconds(Number(e.target.value))}
                className="input-field w-full"
              >
                {NPAT_GAME_DURATION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {formatNpatGameDuration(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Writing time (per letter)</span>
              <select
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(Number(e.target.value))}
                className="input-field w-full"
              >
                {NPAT_TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Marking time (per letter)</span>
              <select
                value={markingTimerSeconds}
                onChange={(e) => setMarkingTimerSeconds(Number(e.target.value))}
                className="input-field w-full"
              >
                {NPAT_MARKING_TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={saveTimers} disabled={savingTimer} className="btn-secondary w-full">
              {savingTimer ? 'Saving…' : 'Save timers'}
            </button>
          </div>

          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            game={game ?? undefined}
            onGameUpdate={setGame}
            onStart={startGame}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${NPAT_MIN_PLAYERS} players to start (${players.length}/${NPAT_MIN_PLAYERS})`
            }
          />
        </>
      )}

      {game.status === 'active' && (
        <>
          {playerManageBlock}
          {!hostPlayerId && (
            <div className="glass-card p-6 text-center text-muted">
              Game in progress — choose Host + play in Host mode and join as a player to call letters and submit
              answers.
            </div>
          )}
          {hostPlayerId && (
            <div className="glass-card p-4 text-center text-sm text-muted">
              You&apos;re playing as <strong className="text-body">{hostPlayerName}</strong> — switch to the Play tab to
              pick letters and submit answers.
            </div>
          )}
          <div className="glass-card-strong p-5 sm:p-6 space-y-3">
            <p className="label-caps">Game controls</p>
            <HostEndGameButton
              gameCode={gameCode}
              hostToken={hostToken}
              onEnded={load}
              label="End game"
              icon={<ExitIcon size={16} />}
              className="btn-danger-soft"
            />
          </div>
        </>
      )}
    </div>
  )

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
      playerHint="Play along with everyone"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — play from the Play tab once you start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <HostMaxPlayersLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        limitType="i_call_on"
        playerCount={players.length}
        onGameUpdate={setGame}
      />
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
        <p className="label-caps">Game settings</p>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Game length</span>
          <select
            value={gameDurationSeconds}
            onChange={(e) => setGameDurationSeconds(Number(e.target.value))}
            className="input-field w-full"
          >
            {NPAT_GAME_DURATION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatNpatGameDuration(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Writing time (per letter)</span>
          <select
            value={timerSeconds}
            onChange={(e) => setTimerSeconds(Number(e.target.value))}
            className="input-field w-full"
          >
            {NPAT_TIMER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Marking time (per letter)</span>
          <select
            value={markingTimerSeconds}
            onChange={(e) => setMarkingTimerSeconds(Number(e.target.value))}
            className="input-field w-full"
          >
            {NPAT_MARKING_TIMER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={saveTimers} disabled={savingTimer} className="btn-secondary w-full">
          {savingTimer ? 'Saving…' : 'Save timers'}
        </button>
      </div>
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
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('i_call_on', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart ? null : `Need at least ${NPAT_MIN_PLAYERS} players to start (${players.length}/${NPAT_MIN_PLAYERS})`
        }
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
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={
        <>
          <NpatFinalResultsShareBlock
            game={game}
            players={players}
            leaderboard={leaderboard}
            highlightPlayerId={hostPlayerId}
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
          {hostWonNpat && (
            <PostWinToCommunity
              gameType="i_call_on"
              gameCode={gameCode}
              winnerName={hostNpatRow?.name ?? ''}
              roundKey={game.session_started_at ?? undefined}
            />
          )}
        </>
      }
    />
  )
}
