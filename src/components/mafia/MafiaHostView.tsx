'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import type { MafiaPhase, MafiaTeam, MafiaRole, Game, GameStatus, Player, ThemeId } from '@/types'
import { MAFIA_MIN_PLAYERS } from '@/lib/mafia'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout, type HostTab } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostMafiaLobbyPanel } from '@/components/host-lobby/HostMafiaLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'

interface HostPlayer {
  id: string
  name: string
  isAlive: boolean
  role: MafiaRole
  deathDay: number | null
  deathCause: string | null
  nightActionTargetPlayerId: string | null
  dayVoteTargetPlayerId: string | null
}

interface MafiaHostStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  maxPlayers?: number
  timerSeconds?: number
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
  replayPending: boolean
  theme?: ThemeId
  winningTeam: MafiaTeam | null
  players: HostPlayer[]
  lastNightKillPlayerId: string | null
  lastVoteResultPlayerId: string | null
  mafiaTargetPlayerId: string | null
  doctorTargetPlayerId: string | null
  detectTargetPlayerId: string | null
}

export function MafiaHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  const { confirm } = useConfirm()
  const [mafiaState, setMafiaState] = useState<MafiaHostStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  // Fetch host state
  const load = useCallback(async (): Promise<{ state: MafiaHostStateResponse | null; ok: boolean }> => {
    try {
      const res = await fetch(`/api/mafia/${gameCode}/host-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        return { state: null, ok: false }
      }
      const data = await res.json()
      setMafiaState(data)
      return { state: data, ok: true }
    } catch {
      return { state: null, ok: false }
    }
  }, [gameCode, hostToken])

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, () => void load())

  useEffect(() => {
    load()
  }, [load])

  useApplyGameTheme(mafiaState?.theme)

  // Table sync triggers state reload
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'mafia_sessions', 'mafia_player_states'],
    () => {
      void load()
    }
  )

  // Polling fallback — only while realtime is disconnected.
  usePolling(
    () => {
      void load()
    },
    [gameCode, load],
    { intervalMs: POLL_INTERVALS.realtimeFallback, enabled: !connected, runImmediately: false }
  )

  useEffect(() => {
    if (mafiaState?.status === 'active') {
      setTab('play')
    }
  }, [mafiaState?.status])

  // Advance phase helper
  const advancePhase = async (nextPhase?: MafiaPhase) => {
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, nextPhase }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to advance phase')
      } else {
        toastSuccess('Game phase advanced')
        await load()
      }
    } catch {
      toastError('Failed to advance phase')
    } finally {
      setActing(false)
    }
  }

  // Auto advance trigger on deadline expiration
  const triggerAutoAdvance = useCallback(async () => {
    try {
      await fetch(`/api/mafia/${gameCode}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, isAuto: true }),
      })
      await load()
    } catch {
      // Ignore
    }
  }, [gameCode, hostToken, load])

  const startGame = async () => {
    if (starting) return
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to start game')
        return
      }
      toastSuccess('Mafia game started!')
      await load()
    } catch {
      toastError('Failed to start game')
    } finally {
      setStarting(false)
    }
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby setup?',
      message: 'This will reset the rematch ready ring and reopen settings.',
      confirmLabel: 'Return to lobby',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, same_settings: false }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to return to lobby')
      }
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to return to lobby')
    }
  }

  const playAgain = async () => {
    const ok = await confirm({
      title: 'Play again with same settings?',
      message: 'This will reset the game state and invite all players to ready up.',
      confirmLabel: 'Play again',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, same_settings: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to trigger play again')
      }
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to play again')
    }
  }

  if (!mafiaState) {
    return <HostLobbySkeleton />
  }

  const gameStatus = (mafiaState.status as GameStatus) ?? 'waiting'
  const isWaiting = gameStatus === 'waiting'
  const isFinished = gameStatus === 'finished' || mafiaState.phase === 'game_over'
  const canStart = mafiaState.players.length >= MAFIA_MIN_PLAYERS

  const gameObj = {
    id: gameCode,
    title: mafiaState.gameTitle || 'Mafia',
    status: isFinished ? 'finished' : gameStatus,
    game_type: 'mafia',
    host_token: hostToken,
    max_players: mafiaState.maxPlayers ?? 10,
    timer_seconds: mafiaState.timerSeconds ?? 60,
    mafia_doctor_enabled: mafiaState.doctorEnabled ?? true,
    mafia_detective_enabled: mafiaState.detectiveEnabled ?? true,
    mafia_anonymous_votes: mafiaState.anonymousVotes ?? false,
    replay_pending: mafiaState.replayPending,
    theme: mafiaState.theme,
    created_at: new Date().toISOString(),
  } as unknown as Game

  const playersList = mafiaState.players.map((p) => ({
    id: p.id,
    game_id: gameCode,
    name: p.name,
    gender: 'both' as const,
    identity_gender: null,
    participant_id: null,
    joined_at: new Date().toISOString(),
    spectator: false,
    is_eliminated: !p.isAlive,
  })) as unknown as Player[]

  const manage = (
    <HostManageSection
      game={gameObj}
      players={playersList}
      highlightPlayerId={null}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="mafia"
      settings={
        isWaiting ? (
          mafiaState.replayPending ? (
            <div className="surface-inset rounded-xl p-6 border border-[var(--border)]">
              <ReplayReadyRing
                players={playersList}
                meId={null}
                isHost
                minPlayers={MAFIA_MIN_PLAYERS}
                onToggleReady={() => {}}
                onStart={() => void startGame()}
                starting={starting}
                gameCode={gameCode}
                hostToken={hostToken}
              />
            </div>
          ) : (
            <HostMafiaLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={gameObj}
              playerCount={playersList.length}
              onGameUpdate={() => void load()}
            />
          )
        ) : undefined
      }
      top={
        isWaiting ? (
          mafiaState.replayPending ? undefined : (
            <p className="surface-inset rounded-xl px-4 py-3 text-sm text-muted">
              You&apos;re hosting this Mafia game as the Narrator. Share the invite link with players, then start the
              game below once at least {MAFIA_MIN_PLAYERS} players have joined.
            </p>
          )
        ) : undefined
      }
      footer={
        isWaiting ? (
          mafiaState.replayPending ? (
            <div className="pt-4 border-t border-[var(--border)] text-center">
              <button
                onClick={() => void confirmReturnToLobby()}
                className="btn-secondary py-2 px-4 text-xs font-semibold rounded-lg"
              >
                Return to lobby setup instead
              </button>
            </div>
          ) : (
            <HostLobbyWaitingFooter
              gameCode={gameCode}
              hostToken={hostToken}
              game={gameObj}
              onStart={() => void startGame()}
              onEnded={() => void load()}
              canStart={canStart}
              starting={starting}
              startLabel="Start Mafia Game"
              startDisabledHint={
                canStart
                  ? null
                  : `Need at least ${MAFIA_MIN_PLAYERS} players to start (${mafiaState.players.length}/${MAFIA_MIN_PLAYERS})`
              }
              className="space-y-3"
            />
          )
        ) : !isFinished ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={() => void load()}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will return to the lobby."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  const { phase, dayNumber, phaseDeadline, players, doctorTargetPlayerId, detectTargetPlayerId, mafiaTargetPlayerId } =
    mafiaState

  const activePlayers = players.filter((p) => p.isAlive)
  const deadPlayers = players.filter((p) => !p.isAlive)

  // Find names helper
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name ?? 'None'

  const primary = (
    <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Col: Control Room */}
      <div className="lg:col-span-1 space-y-6">
        {/* Phase Control Card */}
        <div className="bg-slate-900 border border-indigo-950 rounded-xl p-6 shadow-xl space-y-6">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 border-b border-indigo-950/60 pb-2">
            Phase Control
          </h2>
          <div className="text-center py-2">
            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider block">Current Phase</span>
            <span className="text-2xl font-black text-purple-300 uppercase tracking-wide">
              {phase.replace('_', ' ')}
            </span>
            <span className="text-xs text-indigo-400 block mt-1">Day {dayNumber}</span>
          </div>

          <PhaseTimer deadline={phaseDeadline} onExpired={triggerAutoAdvance} />

          <div className="space-y-3">
            <button
              disabled={acting || phase === 'game_over'}
              onClick={() => advancePhase()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg transition flex items-center justify-center space-x-2"
            >
              <span>➡️</span>
              <span>Advance to Next Phase</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-4 border-t border-indigo-950/60">
              <button
                disabled={acting || phase === 'game_over'}
                onClick={() => advancePhase('night')}
                className="py-2 bg-indigo-950/50 hover:bg-indigo-900/60 text-xs font-medium rounded border border-indigo-900/40 transition"
              >
                Force Night
              </button>
              <button
                disabled={acting || phase === 'game_over'}
                onClick={() => advancePhase('day')}
                className="py-2 bg-indigo-950/50 hover:bg-indigo-900/60 text-xs font-medium rounded border border-indigo-900/40 transition"
              >
                Force Day
              </button>
            </div>
          </div>
        </div>

        {/* God View Resolution Log */}
        <div className="bg-slate-900 border border-indigo-950 rounded-xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 border-b border-indigo-950/60 pb-2">
            Night Targets (God View)
          </h2>
          {phase === 'night' ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded">
                <span className="text-slate-400">Mafia Pick:</span>
                <span className="font-semibold text-red-400">{playerName(mafiaTargetPlayerId)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded">
                <span className="text-slate-400">Doctor Save:</span>
                <span className="font-semibold text-emerald-400">{playerName(doctorTargetPlayerId)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded">
                <span className="text-slate-400">Detective Probe:</span>
                <span className="font-semibold text-blue-400">{playerName(detectTargetPlayerId)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Night targets are only active during the night phase.</p>
          )}
        </div>
      </div>

      {/* Right Col: Players & Roles List */}
      <div className="lg:col-span-2 space-y-6">
        {/* Active Players */}
        <div className="bg-slate-900 border border-indigo-950 rounded-xl p-6 shadow-xl">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 mb-4 border-b border-indigo-950/60 pb-2">
            Active Players ({activePlayers.length})
          </h2>
          <div className="divide-y divide-indigo-950/40 space-y-2">
            {activePlayers.map((p) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row justify-between sm:items-center py-3 bg-slate-950/10 px-3 rounded-lg border border-indigo-950/30"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">👤</span>
                  <div>
                    <span className="font-bold text-slate-200">{p.name}</span>
                    <span
                      className={`block text-xs uppercase font-extrabold ${p.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      {p.role}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:items-end mt-2 sm:mt-0 text-xs space-y-1">
                  {phase === 'night' && p.role !== 'villager' && (
                    <span className="text-slate-400">
                      Night target:{' '}
                      <strong className="text-purple-400">
                        {p.nightActionTargetPlayerId ? playerName(p.nightActionTargetPlayerId) : 'None'}
                      </strong>
                    </span>
                  )}
                  {phase === 'day' && (
                    <span className="text-slate-400">
                      Voted for:{' '}
                      <strong className="text-amber-400">
                        {p.dayVoteTargetPlayerId ? playerName(p.dayVoteTargetPlayerId) : 'None'}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dead Players */}
        <div className="bg-slate-900 border border-indigo-950 rounded-xl p-6 shadow-xl">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-red-400 mb-4 border-b border-indigo-950/60 pb-2">
            Eliminated Players ({deadPlayers.length})
          </h2>
          {deadPlayers.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No one has been eliminated yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {deadPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center p-3 bg-slate-950/20 rounded-lg border border-red-950/20 opacity-75"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">💀</span>
                    <div>
                      <span className="font-bold line-through text-slate-400">{p.name}</span>
                      <span className="block text-xs font-semibold text-red-500/80 uppercase">{p.role}</span>
                    </div>
                  </div>
                  <span className="text-xs text-red-400 px-2 py-0.5 bg-red-950/20 border border-red-900/30 rounded">
                    Day {p.deathDay} — {p.deathCause === 'mafia_kill' ? 'Killed' : 'Voted out'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const hostFinishedPanel = (
    <div className="max-w-2xl w-full mx-auto glass-card border border-[var(--border)] rounded-2xl p-8 shadow-2xl space-y-6 text-center">
      <h1 className="text-4xl font-extrabold text-[var(--primary)] animate-pulse">GAME OVER</h1>

      {mafiaState?.winningTeam ? (
        <div className="space-y-2">
          <p className="text-muted text-sm uppercase tracking-widest font-bold">Winning Team</p>
          <div
            className={`text-3xl font-black ${mafiaState.winningTeam === 'mafia' ? 'text-red-500' : 'text-emerald-400'}`}
          >
            {mafiaState.winningTeam === 'mafia' ? 'MAFIA 🔪' : 'VILLAGE 🏘️'}
          </div>
        </div>
      ) : (
        <p className="text-muted font-semibold">The game has finished!</p>
      )}

      <div className="border-t border-[var(--border)] pt-6">
        <h3 className="text-sm font-semibold tracking-widest uppercase text-[var(--primary)] mb-4 font-mono">
          Roles Reveal
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex justify-between items-center text-sm p-3 rounded bg-[var(--surface-inset-bg)] border border-[var(--border)]"
            >
              <span className="font-semibold text-muted">{p.name}</span>
              <span
                className={`font-mono text-xs uppercase ${p.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'}`}
              >
                {p.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => void playAgain()}
          className="btn-primary py-3 px-6 text-sm font-semibold rounded-xl transition"
        >
          ↻ Play again · same settings
        </button>
        <button
          onClick={() => void confirmReturnToLobby()}
          className="btn-secondary py-3 px-6 text-sm font-semibold rounded-xl transition"
        >
          Return to lobby
        </button>
      </div>
    </div>
  )

  // Fresh lobby (not the play-again ready-up flow, which keeps the tabbed ReplayReadyRing).
  const waitingLobby = isWaiting && !mafiaState.replayPending
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={gameObj}
        gameTypeLabel={gameTypeConfig('mafia').label}
        players={playersList}
        maxPlayers={lobbyMaxPlayersFromGameClient('mafia', gameObj) ?? gameObj.max_players}
        howToPlay={<HostRulesRow gameType="mafia" />}
        playCard={
          <p className="surface-inset rounded-xl px-4 py-3 text-sm text-muted">
            You&apos;re the Narrator for this Mafia game — share the invite link with players, then start the game below
            once at least {`${MAFIA_MIN_PLAYERS} players`} have joined. (The Narrator runs the game and doesn&apos;t
            play.)
          </p>
        }
        settingsChildren={
          <>
            <HostMafiaLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={gameObj}
              playerCount={playersList.length}
              onGameUpdate={() => void load()}
            />
            <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
          </>
        }
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${MAFIA_MIN_PLAYERS} players to start (${mafiaState.players.length}/${MAFIA_MIN_PLAYERS})`
        }
        startLabel="Start Mafia game"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        onEnded={() => void load()}
      />
    )
  }

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={gameObj.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind="watch"
      showTabs={!isFinished}
      gameStarted={!isWaiting}
      header={<HostGameHeader game={gameObj} />}
      primary={primary}
      manage={manage}
      finished={hostFinishedPanel}
    />
  )
}

function PhaseTimer({ deadline, onExpired }: { deadline: string | null; onExpired: () => void }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) {
      setTimeLeft(null)
      return
    }
    const target = new Date(deadline).getTime()
    let expiredFired = false
    const update = () => {
      const remaining = Math.max(0, Math.round((target - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0 && !expiredFired) {
        expiredFired = true
        onExpired()
      }
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [deadline, onExpired])

  if (timeLeft === null || timeLeft <= 0) return null

  return (
    <div className="flex flex-col items-center justify-center my-2 p-3 bg-slate-950/50 rounded border border-indigo-950/40">
      <div className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Phase Timer</div>
      <div className="text-3xl font-extrabold font-mono text-purple-400 mt-1">{timeLeft}s</div>
    </div>
  )
}
