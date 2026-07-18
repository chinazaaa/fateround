'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LandmineActiveRound } from '@/components/landmine/LandmineActiveRound'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResults } from '@/components/ShareResults'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { useLandmineAdvance } from '@/hooks/useLandmineAdvance'
import {
  gameLandmineMode,
  gameLandmineMineSource,
  landmineModeLabel,
  parseLandmineMetadata,
  resolveActiveLandmineRound,
  tallyLandmineScores,
  LANDMINE_MIN_PLAYERS,
  LANDMINE_WRITING_TIMER_OPTIONS,
  LANDMINE_MARKING_TIMER_OPTIONS,
  LANDMINE_CATEGORY_TIMER_OPTIONS,
  clampLandmineCategoryTimer,
  clampLandmineElimSeconds,
  LANDMINE_ELIM_SECONDS_OPTIONS,
  LANDMINE_MINE_COUNT_OPTIONS,
  LANDMINE_ROUND_COUNT_OPTIONS,
  LANDMINE_MANUAL_CYCLE_OPTIONS,
} from '@/lib/landmine'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  LANDMINE_ANSWER_SELECT,
  LANDMINE_MARK_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { Game, LandmineAnswer, LandmineMark, LandmineMineSource, LandmineMode, Player, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { ExitIcon } from '@/components/host/host-icons'

type HostTab = 'play' | 'manage'

export function LandmineHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const finishedCaptureRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<LandmineAnswer[]>([])
  const [marks, setMarks] = useState<LandmineMark[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [modeSetting, setModeSetting] = useState<LandmineMode>('zero_points')
  const [mineSourceSetting, setMineSourceSetting] = useState<LandmineMineSource>('system')
  const [mineCount, setMineCount] = useState(1)
  const [originalityBonus, setOriginalityBonus] = useState(true)
  const [roundCount, setRoundCount] = useState(5)
  const [writingTimer, setWritingTimer] = useState(45)
  const [markingTimer, setMarkingTimer] = useState(45)
  const [categoryTimer, setCategoryTimer] = useState(10)
  const [elimSeconds, setElimSeconds] = useState(300)
  const [reviewSetting, setReviewSetting] = useState(true)
  const [tab, setTab] = useState<HostTab>('manage')
  const settingsHydratedRef = useRef(false)

  useScrollHostViewToTop({ gameStatus: game?.status, tab })
  useTurnNotifications({ status: game?.status })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, ansRes, marksRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('landmine_answers').select(LANDMINE_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('landmine_marks').select(LANDMINE_MARK_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, ansRes, marksRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      // Hydrate the editable settings once — realtime reloads (player joins, etc.) must not
      // clobber the host's in-progress edits before they Save/Start.
      if (!settingsHydratedRef.current) {
        settingsHydratedRef.current = true
        setModeSetting(gameLandmineMode(gameRes.data))
        setMineSourceSetting(gameLandmineMineSource(gameRes.data))
        setMineCount(gameRes.data.landmine_mine_count ?? 1)
        setOriginalityBonus(gameRes.data.landmine_originality_bonus !== false)
        setRoundCount(gameRes.data.rounds_count ?? 5)
        setWritingTimer(gameRes.data.timer_seconds ?? 45)
        setMarkingTimer(gameRes.data.operative_timer_seconds ?? 45)
        setCategoryTimer(clampLandmineCategoryTimer(gameRes.data.game_duration_seconds))
        setElimSeconds(clampLandmineElimSeconds(gameRes.data.landmine_elim_seconds))
        setReviewSetting(gameRes.data.landmine_review !== false)
      }
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

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'landmine_answers', 'landmine_marks'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  // Safety reload while active even when realtime looks connected — a dropped phase event would
  // otherwise strand the view on the old phase (see LandminePlayerView for the full rationale).
  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.activeGame,
    enabled: connected && game?.status === 'active',
    runImmediately: false,
  })

  useLandmineAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  const currentRound = useMemo(() => {
    if (!game) return null
    return resolveActiveLandmineRound(rounds, game.current_round_number)
  }, [rounds, game])
  const currentMetadata = currentRound ? parseLandmineMetadata(currentRound.landmine_metadata) : null

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const settingsPayload = () => ({
    hostToken,
    landmine_mode: modeSetting,
    landmine_mine_source: mineSourceSetting,
    landmine_mine_count: mineCount,
    landmine_originality_bonus: originalityBonus,
    landmine_elim_seconds: elimSeconds,
    landmine_review: reviewSetting,
    rounds_count: roundCount,
    timer_seconds: writingTimer,
    operative_timer_seconds: markingTimer,
    game_duration_seconds: categoryTimer,
  })

  const startGame = async () => {
    setStarting(true)
    try {
      const saveRes = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload()),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error ?? 'Failed to save settings')

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

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      if (data.game) setGame(data.game)
      success('Settings updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
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
      message: 'Reopens the game with the same settings. Everyone taps “ready” and you start the next game.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
  }

  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const canStart = players.length >= LANDMINE_MIN_PLAYERS
  const mode = game ? gameLandmineMode(game) : modeSetting
  const leaderboard = useMemo(() => tallyLandmineScores(answers, players), [answers, players])
  const winner = leaderboard.find((r) => !r.eliminated) ?? leaderboard[0]
  const hostRow = leaderboard.find((r) => r.id === hostPlayerId)
  const hostWon =
    !!hostRow && winner != null && hostRow.id === winner.id && (mode === 'elimination' || hostRow.score > 0)

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer). Landmine has no in-game settings,
  // so this is just How-to-play + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings gameCode={gameCode} hostToken={hostToken} gameType="landmine" onEnded={load} />
      ) : null,
    [game?.status, gameCode, hostToken, load]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('landmine')

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
          minPlayers={LANDMINE_MIN_PLAYERS}
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

  const interactivePlay = hostPlays && hostPlayerId && game.status === 'active' && (
    <LandmineActiveRound
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
        rows={leaderboard.map((r) => ({ id: r.id, name: r.eliminated ? `${r.name} 💥` : r.name, score: r.score }))}
        highlightId={hostPlayerId}
        scoreLabel={(score) => `${score} pts`}
        emphasizeLeader
      />
      {currentMetadata?.category && game.status === 'active' && (
        <div className="glass-card p-4 text-center text-sm text-muted">
          Round {currentRound?.round_number} · Category:{' '}
          <strong className="text-body">{currentMetadata.category}</strong> · {currentMetadata.phase}
        </div>
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
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="landmine" />}

      {game.status === 'waiting' && (
        <>
          {playerManageBlock}

          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
            <p className="label-caps">Game settings</p>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Who plants the mine</span>
              <select
                value={mineSourceSetting}
                onChange={(e) => {
                  const next = e.target.value as LandmineMineSource
                  setMineSourceSetting(next)
                  // Manual setup needs more time to type; default to a single cycle. Auto restores.
                  setCategoryTimer(next === 'manual' ? 30 : 10)
                  setRoundCount(next === 'manual' ? 1 : 5)
                  // Manual's setter judges (review on); auto stays hands-off by default.
                  setReviewSetting(next === 'manual')
                }}
                className="input-field w-full"
              >
                <option value="system">Auto — the app plants it, everyone plays</option>
                <option value="manual">Manual — players take turns setting it</option>
              </select>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={reviewSetting}
                onChange={(e) => setReviewSetting(e.target.checked)}
                className="mt-1"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">Review answers before reveal</span>
                <span className="block text-xs text-muted">
                  {mineSourceSetting === 'manual'
                    ? 'The setter checks each answer Valid/Void before scores show.'
                    : 'You (the host) check each answer Valid/Void before scores show. Off = instant reveal.'}
                </span>
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Mode</span>
              <select
                value={modeSetting}
                onChange={(e) => setModeSetting(e.target.value as LandmineMode)}
                className="input-field w-full"
              >
                <option value="zero_points">Zero Points — mine scores 0</option>
                <option value="elimination">Elimination — mine knocks you out</option>
              </select>
            </label>
            {modeSetting === 'elimination' && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Time limit</span>
                <select
                  value={elimSeconds}
                  onChange={(e) => setElimSeconds(Number(e.target.value))}
                  className="input-field w-full"
                >
                  {LANDMINE_ELIM_SECONDS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s / 60} min
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modeSetting === 'zero_points' && mineSourceSetting === 'system' && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Rounds</span>
                <select
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  className="input-field w-full"
                >
                  {LANDMINE_ROUND_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} rounds
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modeSetting === 'zero_points' && mineSourceSetting === 'manual' && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Rounds (each = everyone sets once)</span>
                <select
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  className="input-field w-full"
                >
                  {LANDMINE_MANUAL_CYCLE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} round{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Mines per round</span>
              <select
                value={mineCount}
                onChange={(e) => setMineCount(Number(e.target.value))}
                className="input-field w-full"
              >
                {LANDMINE_MINE_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} mine{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Time to pick a category</span>
              <select
                value={categoryTimer}
                onChange={(e) => setCategoryTimer(Number(e.target.value))}
                className="input-field w-full"
              >
                {LANDMINE_CATEGORY_TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Time to answer</span>
              <select
                value={writingTimer}
                onChange={(e) => setWritingTimer(Number(e.target.value))}
                className="input-field w-full"
              >
                {LANDMINE_WRITING_TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Time to vote on answers</span>
              <select
                value={markingTimer}
                onChange={(e) => setMarkingTimer(Number(e.target.value))}
                className="input-field w-full"
              >
                {LANDMINE_MARKING_TIMER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Originality bonus (+5)</span>
              <input
                type="checkbox"
                checked={originalityBonus}
                onChange={(e) => setOriginalityBonus(e.target.checked)}
              />
            </label>
            <button type="button" onClick={saveSettings} disabled={savingSettings} className="btn-secondary w-full">
              {savingSettings ? 'Saving…' : 'Save settings'}
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
                : `Need at least ${LANDMINE_MIN_PLAYERS} players to start (${players.length}/${LANDMINE_MIN_PLAYERS})`
            }
          />
        </>
      )}

      {game.status === 'active' && (
        <>
          {playerManageBlock}
          {!hostPlayerId && (
            <div className="glass-card p-6 text-center text-muted">
              Game in progress — switch to Host + play and join as a player to pick categories and submit answers.
            </div>
          )}
          {hostPlayerId && (
            <div className="glass-card p-4 text-center text-sm text-muted">
              You&apos;re playing as <strong className="text-body">{hostPlayerName}</strong> — switch to the Play tab.
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
          Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
        <p className="label-caps">Game settings</p>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Who plants the mine</span>
          <select
            value={mineSourceSetting}
            onChange={(e) => {
              const next = e.target.value as LandmineMineSource
              setMineSourceSetting(next)
              // Manual setup needs more time to type; default to a single cycle. Auto restores.
              setCategoryTimer(next === 'manual' ? 30 : 10)
              setRoundCount(next === 'manual' ? 1 : 5)
            }}
            className="input-field w-full"
          >
            <option value="system">Auto — the app plants it, everyone plays</option>
            <option value="manual">Manual — players take turns setting it</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Mode</span>
          <select
            value={modeSetting}
            onChange={(e) => setModeSetting(e.target.value as LandmineMode)}
            className="input-field w-full"
          >
            <option value="zero_points">Zero Points — mine scores 0</option>
            <option value="elimination">Elimination — mine knocks you out</option>
          </select>
        </label>
        {modeSetting === 'elimination' && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Time limit</span>
            <select
              value={elimSeconds}
              onChange={(e) => setElimSeconds(Number(e.target.value))}
              className="input-field w-full"
            >
              {LANDMINE_ELIM_SECONDS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s / 60} min
                </option>
              ))}
            </select>
          </label>
        )}
        {modeSetting === 'zero_points' && mineSourceSetting === 'system' && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Rounds</span>
            <select
              value={roundCount}
              onChange={(e) => setRoundCount(Number(e.target.value))}
              className="input-field w-full"
            >
              {LANDMINE_ROUND_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} rounds
                </option>
              ))}
            </select>
          </label>
        )}
        {modeSetting === 'zero_points' && mineSourceSetting === 'manual' && (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Rounds (each = everyone sets once)</span>
            <select
              value={roundCount}
              onChange={(e) => setRoundCount(Number(e.target.value))}
              className="input-field w-full"
            >
              {LANDMINE_MANUAL_CYCLE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} round{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Mines per round</span>
          <select
            value={mineCount}
            onChange={(e) => setMineCount(Number(e.target.value))}
            className="input-field w-full"
          >
            {LANDMINE_MINE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} mine{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Time to pick a category</span>
          <select
            value={categoryTimer}
            onChange={(e) => setCategoryTimer(Number(e.target.value))}
            className="input-field w-full"
          >
            {LANDMINE_CATEGORY_TIMER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Time to answer</span>
          <select
            value={writingTimer}
            onChange={(e) => setWritingTimer(Number(e.target.value))}
            className="input-field w-full"
          >
            {LANDMINE_WRITING_TIMER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Time to vote on answers</span>
          <select
            value={markingTimer}
            onChange={(e) => setMarkingTimer(Number(e.target.value))}
            className="input-field w-full"
          >
            {LANDMINE_MARKING_TIMER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Originality bonus (+5)</span>
          <input type="checkbox" checked={originalityBonus} onChange={(e) => setOriginalityBonus(e.target.checked)} />
        </label>
        <button type="button" onClick={saveSettings} disabled={savingSettings} className="btn-secondary w-full">
          {savingSettings ? 'Saving…' : 'Save settings'}
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
        maxPlayers={lobbyMaxPlayersFromGameClient('landmine', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${LANDMINE_MIN_PLAYERS} players to start (${players.length}/${LANDMINE_MIN_PLAYERS})`
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
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      noManageTab={game.status === 'active'}
      finished={
        <div className="space-y-4">
          <div ref={finishedCaptureRef} className="space-y-6">
            <FinishedWinnerHero
              winnerName={winner?.name}
              game={game}
              subtitle={`Landmine · ${landmineModeLabel(mode)}`}
              emoji="🧨"
            />
            <PaginatedLeaderboard
              title="Final standings"
              rows={leaderboard.map((r) => ({
                id: r.id,
                name: r.eliminated ? `${r.name} 💥` : r.name,
                score: r.score,
              }))}
              highlightId={hostPlayerId}
              scoreLabel={(score) => `${score} pts`}
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
          {hostWon && (
            <PostWinToCommunity
              gameType="landmine"
              gameCode={gameCode}
              winnerName={hostRow?.name ?? ''}
              roundKey={game.session_started_at ?? undefined}
            />
          )}
        </div>
      }
    />
  )
}
