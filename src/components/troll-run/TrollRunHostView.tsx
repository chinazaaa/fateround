'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  HOST_GAME_SELECT,
  PLAYER_SELECT,
  TROLL_RUN_EVENT_SELECT,
  TROLL_RUN_PLAYER_STATE_SELECT,
  TROLL_RUN_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { usePolling, POLL_INTERVALS } from '@/hooks/usePolling'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useTrollRunAdvanceNudge } from '@/hooks/useTrollRunAdvanceNudge'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, TrollRunEvent, TrollRunPlayerState, TrollRunSession } from '@/types'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { TrollRunScoreboard } from './TrollRunScoreboard'
import { TrollRunLiveFeed, TROLL_RUN_FEED_HISTORY } from './TrollRunLiveFeed'
import { TrollRunRaceProgress } from './TrollRunRaceProgress'
import { TrollRunPlayerView } from './TrollRunPlayerView'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostTrollRunLobbyPanel } from '@/components/host-lobby/HostTrollRunLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { gameTypeConfig } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { TROLL_RUN_MIN_PLAYERS } from '@/lib/troll-run-types'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'

export interface TrollRunHostViewProps {
  gameCode: string
  hostToken: string
}

type HostTab = 'manage' | 'play'

/** Seconds left on the round clock below which the host's timer reads as urgent. */
const TROLL_RUN_HOST_URGENT_SECONDS = 20

export function TrollRunHostView({ gameCode, hostToken }: TrollRunHostViewProps) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const cfg = gameTypeConfig('troll_run')

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<TrollRunSession | null>(null)
  const [playerStates, setPlayerStates] = useState<TrollRunPlayerState[]>([])
  const [events, setEvents] = useState<TrollRunEvent[]>([])
  const [starting, setStarting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [tab, setTab] = useState<HostTab>('play')

  useApplyGameTheme(game?.theme, game?.game_type)

  const reload = useCallback(async () => {
    const [gameRes, playersRes, sessRes, statesRes, eventsRes] = await Promise.all([
      supabase.from('games').select(HOST_GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('troll_run_sessions').select(TROLL_RUN_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('troll_run_player_states').select(TROLL_RUN_PLAYER_STATE_SELECT).eq('game_id', gameCode),
      // Newest first with a cap, flipped back into feed order below: a race logs a death for every
      // trap every runner falls for, and the ticker only ever shows the tail.
      supabase
        .from('troll_run_events')
        .select(TROLL_RUN_EVENT_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(TROLL_RUN_FEED_HISTORY),
    ])

    setGame((gameRes.data as unknown as Game) ?? null)
    setPlayers((playersRes.data as unknown as Player[]) ?? [])
    setSession(sessRes.data ? (sessRes.data as unknown as TrollRunSession) : null)
    setPlayerStates((statesRes.data as unknown as TrollRunPlayerState[]) ?? [])
    setEvents(((eventsRes.data as unknown as TrollRunEvent[]) ?? []).slice().reverse())
  }, [gameCode])

  useEffect(() => {
    reload()
  }, [reload])

  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id', apply: (row) => setGame(row as unknown as Game) },
      {
        table: 'players',
        apply: (row) => {
          const p = row as unknown as Player
          setPlayers((prev) => {
            const index = prev.findIndex((item) => item.id === p.id)
            if (index >= 0) {
              const updated = [...prev]
              updated[index] = { ...updated[index], ...p }
              return updated
            }
            return [...prev, p]
          })
        },
      },
      { table: 'troll_run_sessions', apply: (row) => setSession(row as unknown as TrollRunSession) },
      {
        table: 'troll_run_player_states',
        apply: (row) => {
          setPlayerStates((prev) => {
            const index = prev.findIndex((state) => state.id === row.id)
            if (index >= 0) {
              const updated = [...prev]
              updated[index] = row as unknown as TrollRunPlayerState
              return updated
            }
            return [...prev, row as unknown as TrollRunPlayerState]
          })
        },
      },
      {
        table: 'troll_run_events',
        apply: (row) => {
          const rowObj = row as unknown as TrollRunEvent
          setEvents((prev) => {
            if (prev.some((e) => e.id === rowObj.id)) return prev
            return [...prev, rowObj].slice(-TROLL_RUN_FEED_HISTORY)
          })
        },
      },
    ],
    reload,
    { channelKey: 'host' }
  )

  usePolling(() => reload(), [gameCode, reload], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="troll_run"
          onEnded={reload}
          endGameLabel="End race"
          endGameConfirmTitle="End this Troll Run race?"
          endGameConfirmMessage="All runners will see the final championship results."
        />
      ) : null,
    [game?.status, gameCode, hostToken, reload]
  )
  useRegisterGameSettings(hostSettingsNode)

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
    onReload: reload,
    toast: { success, error: toastError },
    onModeChange: (mode) => {
      if (mode === 'player') setTab('play')
      else if (mode === 'spectator') setTab('manage')
    },
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setHostJoinName('')
      setPlayers((prev) => prev.filter((player) => player.id !== playerId))
    },
    [onHostSeatRemoved, setHostJoinName]
  )

  const { removingPlayerId, removePlayer } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useTrollRunAdvanceNudge({ gameCode, session, hostToken })

  // `turn_deadline_at` already is the deadline, so the shared countdown gets no extra delay.
  const deadlineSecondsLeft = useDeadlineCountdown(
    session?.turn_deadline_at,
    0,
    session?.phase === 'countdown' || session?.phase === 'racing'
  )

  const hostPlays = hostMode === 'player' && Boolean(hostPlayerId)
  useTimerTickSound(deadlineSecondsLeft, !hostPlays && session?.phase === 'racing', 10)

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const player of players) {
      map.set(player.id, player.name)
    }
    return map
  }, [players])

  const activePlayers = useMemo(() => {
    return players.filter((player) => player.spectator !== true)
  }, [players])

  const handleStartGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error || 'Failed to start game')
      } else {
        await reload()
      }
    } catch {
      toastError('Network error starting game')
    } finally {
      setStarting(false)
    }
  }

  const handleNextRound = async () => {
    setAdvancing(true)
    try {
      const res = await fetch('/api/troll-run/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, forceNextRound: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error || 'Failed to advance round')
      } else {
        await reload()
      }
    } catch {
      toastError('Network error')
    } finally {
      setAdvancing(false)
    }
  }

  /**
   * "Play again · same settings" reopens the room as an open lobby flagged for the ready-up ring;
   * a plain reset (sameSettings=false) is the normal "Return to lobby". Both go through the same
   * endpoint, which is also what clears the finished race's session rows.
   */
  const resetGame = async (sameSettings: boolean) => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error || 'Failed to reset the room')
        return
      }
      success(sameSettings ? 'Ready up for the next race!' : 'Back to the lobby')
      await reload()
    } catch {
      toastError('Network error')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again with same settings?',
      message: 'This will reset the room and let runners ready up for another match.',
      confirmLabel: 'Play again',
    })
    if (!ok) return
    await resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message: 'This will return all runners to the lobby so you can adjust settings.',
      confirmLabel: 'Return to lobby',
    })
    if (!ok) return
    await resetGame(false)
  }

  // 0. Ensure no flash when initial game row is loading
  if (!game) {
    return <HostLobbySkeleton />
  }

  // Replay ready ring if play again was triggered
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={TROLL_RUN_MIN_PLAYERS}
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

  const canStart = activePlayers.length >= TROLL_RUN_MIN_PLAYERS

  // 1. Lobby screen — strictly when waiting for initial launch
  if (game.status === 'waiting') {
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
        spectatorHint="Direct the race from the big screen"
        playerHint="Run alongside the other players"
        playingNote={
          <p className="text-sm text-muted">
            Playing as <strong className="text-body">{hostPlayerName}</strong> — run once you start.
          </p>
        }
      />
    )

    const lobbySettings = (
      <>
        <HostTrollRunLobbyPanel gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
      </>
    )

    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('troll_run', game) ?? game.max_players ?? 6}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStartGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${TROLL_RUN_MIN_PLAYERS} runners to start (${activePlayers.length}/${TROLL_RUN_MIN_PLAYERS})`
        }
        startLabel="Start race"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={reload}
      />
    )
  }

  // 2. Live Race Dashboard for host management or Finished screen
  const isFinished = game.status === 'finished' || session?.phase === 'finished'
  const effectiveSession: TrollRunSession | null =
    session ??
    (isFinished
      ? {
          id: 'finished',
          game_id: gameCode,
          phase: 'finished',
          current_round: game?.rounds_count ?? game?.troll_run_rounds ?? 1,
          total_rounds: game?.rounds_count ?? game?.troll_run_rounds ?? 1,
          current_world: game?.troll_run_world ?? 'pits',
          levels_per_round: 10,
          round_time_limit: game?.troll_run_time_limit ?? 120,
          round_started_at: null,
          turn_deadline_at: null,
          level_order: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : null)

  // If game is active but session row is still loading, show loading skeleton with reset fallback
  if (!effectiveSession) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center p-8 text-center space-y-4">
        <HostLobbySkeleton />
        <div className="pt-4">
          <button type="button" onClick={() => void resetGame(false)} className="btn-secondary text-xs">
            Reset to lobby
          </button>
        </div>
      </div>
    )
  }

  // 2. Live Race Dashboard for host management
  const manageRaceDashboard =
    effectiveSession.phase === 'scoreboard' || effectiveSession.phase === 'finished' || isFinished ? (
      <div className="mx-auto flex max-w-4xl flex-col space-y-6 p-4 sm:p-8">
        <TrollRunScoreboard
          session={effectiveSession}
          playerStates={playerStates}
          playerNames={playerNames}
          isHost={true}
          onNextRound={handleNextRound}
          loading={advancing}
          gameCode={gameCode}
          hostToken={hostToken}
          onEndGameEarly={reload}
          myPlayerId={hostPlayerId}
          onPlayAgain={confirmPlayAgain}
          onReturnToLobby={confirmReturnToLobby}
          playingAgain={playingAgain}
        />
      </div>
    ) : (
      <div className="mx-auto flex max-w-4xl flex-col space-y-6 p-4 sm:p-8">
        {/* Header Bar */}
        <div className="glass-card-strong flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] shrink-0">
              <Glyph icon={gameIcon('troll_run')} size={18} />
            </span>
            <div>
              <h1 className="text-xl font-black text-[var(--foreground)]">
                Troll Run — Round <span className="tabular-nums">{effectiveSession.current_round}</span> /{' '}
                <span className="tabular-nums">{effectiveSession.total_rounds}</span>
              </h1>
              <p className="text-muted text-xs">
                World:{' '}
                <span className="text-[var(--primary)] font-bold capitalize">{effectiveSession.current_world}</span>
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="text-right">
            <div className="text-faint text-[10px] font-bold uppercase tracking-wider">
              {effectiveSession.phase === 'countdown' ? 'Starting in' : 'Time Remaining'}
            </div>
            <div
              className={`font-mono text-2xl font-black tabular-nums ${
                deadlineSecondsLeft <= TROLL_RUN_HOST_URGENT_SECONDS
                  ? 'text-rose-400 animate-pulse'
                  : 'text-[var(--primary)]'
              }`}
            >
              {effectiveSession.phase === 'countdown'
                ? `${deadlineSecondsLeft}s`
                : formatMinutesSeconds(deadlineSecondsLeft)}
            </div>
          </div>
        </div>

        <TrollRunRaceProgress session={effectiveSession} players={players} playerStates={playerStates} />

        {/* Live Event Ticker */}
        <div>
          <div className="text-faint mb-2 text-xs font-bold uppercase tracking-wider">Live Trap Ticker</div>
          <TrollRunLiveFeed events={events} playerNames={playerNames} />
        </div>

        {/* Cutting a round short or ending the match are deliberate actions, so they sit in their
            own block below the live view rather than beside the ticking timer. */}
        <div className="glass-card-strong space-y-3 p-5 sm:p-6">
          <p className="label-caps">Game controls</p>
          <button
            type="button"
            onClick={() => void handleNextRound()}
            disabled={advancing}
            className="btn-secondary w-full"
          >
            {advancing ? 'Ending…' : 'End round early'}
          </button>

          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={reload}
            label="End game"
            icon={<ExitIcon size={14} />}
            className="btn-danger-soft"
            confirmTitle="End this Troll Run race?"
            confirmMessage="The current match will end and all runners will see the final championship standings."
          />
        </div>
      </div>
    )

  // 3. Host is playing: Render HostGameLayout with TrollRunPlayerView as primary
  if (hostPlays) {
    return (
      <HostGameLayout
        onRemovePlayer={removePlayer}
        gameCode={gameCode}
        status={game.status}
        tab={tab}
        onTabChange={setTab}
        primaryKind="play"
        game={game}
        players={players}
        hostPlayerId={hostPlayerId}
        onHostRejoined={reload}
        showTabs={false}
        noManageTab
        gameStarted={true}
        header={<HostGameHeader game={game} />}
        primary={
          // No width cap here: the race view sizes its own stage to the viewport, and a 42rem
          // wrapper would hold the canvas at its old postage-stamp size on a desktop.
          <div className="mx-auto w-full">
            <TrollRunPlayerView
              gameCode={gameCode}
              hostToken={hostToken}
              onNextRound={handleNextRound}
              onPlayAgain={confirmPlayAgain}
              onReturnToLobby={confirmReturnToLobby}
              onEndGameEarly={reload}
              advancing={advancing}
              playingAgain={playingAgain}
              initialSession={effectiveSession}
              initialPlayers={players}
              initialPlayerStates={playerStates}
              initialEvents={events}
              initialGame={game}
              initialPlayerId={hostPlayerId}
              initialResumeToken={hostResumeToken}
            />
          </div>
        }
        manage={manageRaceDashboard}
      />
    )
  }

  // 4. Host is spectator: Scoreboard/Finished screen
  if (effectiveSession.phase === 'scoreboard' || effectiveSession.phase === 'finished' || isFinished) {
    return (
      <div className="page-wrap flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center p-4 sm:p-8">
        <TrollRunScoreboard
          session={effectiveSession}
          playerStates={playerStates}
          playerNames={playerNames}
          isHost={true}
          onNextRound={handleNextRound}
          loading={advancing}
          gameCode={gameCode}
          hostToken={hostToken}
          onEndGameEarly={reload}
          myPlayerId={hostPlayerId}
          onPlayAgain={confirmPlayAgain}
          onReturnToLobby={confirmReturnToLobby}
          playingAgain={playingAgain}
        />
      </div>
    )
  }

  // 5. Host is spectator: Countdown overlay
  if (effectiveSession.phase === 'countdown') {
    return (
      <div className="page-wrap flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-6 text-center">
        <span className="animate-bounce font-mono text-8xl font-black tabular-nums text-[var(--primary)] sm:text-9xl">
          {deadlineSecondsLeft > 0 ? deadlineSecondsLeft : 'GO!'}
        </span>
        <h2 className="text-3xl font-black text-[var(--foreground)]">Get Ready to Run!</h2>
        <p className="text-muted text-sm">
          Round <span className="tabular-nums">{effectiveSession.current_round}</span> of{' '}
          <span className="tabular-nums">{effectiveSession.total_rounds}</span> · World:{' '}
          <strong className="text-[var(--primary)] capitalize">{effectiveSession.current_world}</strong>
        </p>
      </div>
    )
  }

  // 6. Host is spectator: Live race dashboard
  return manageRaceDashboard
}
