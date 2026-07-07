'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import type { MafiaPhase, MafiaTeam, MafiaRole } from '@/types'
import { MAFIA_MIN_PLAYERS } from '@/lib/mafia'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'

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
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
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

  useEffect(() => {
    load()
  }, [load])

  useApplyGameTheme('mafia')

  // Table sync triggers state reload
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'mafia_sessions', 'mafia_player_states'], () => {
    void load()
  })

  // Polling fallback
  usePolling(
    () => {
      void load()
    },
    [gameCode, load],
    { intervalMs: POLL_INTERVALS.realtimeFallback }
  )

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

  if (!mafiaState) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-purple-200">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
          <p className="text-lg font-medium">Loading Narrator Dashboard...</p>
        </div>
      </div>
    )
  }

  if (mafiaState.status === 'waiting') {
    const canStart = mafiaState.players.length >= MAFIA_MIN_PLAYERS
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <header className="px-6 py-4 border-b border-indigo-950 bg-slate-900 flex justify-between items-center shadow-lg">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">👁️</span>
            <div>
              <h1 className="font-extrabold text-lg text-purple-300">Narrator Dashboard</h1>
              <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold">Game Code: {gameCode}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs font-mono bg-slate-800 px-3 py-1 rounded border border-slate-700 text-slate-400">
              Lobby
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col justify-center items-center">
          <div className="w-full bg-slate-900 border border-indigo-950 rounded-2xl p-8 shadow-2xl space-y-8">
            <div className="text-center space-y-2">
              <span className="inline-block px-3 py-1 bg-purple-950/80 border border-purple-800 rounded-full text-xs font-bold tracking-widest uppercase text-purple-300">
                Waiting for Players
              </span>
              <h2 className="text-3xl font-black text-slate-100">Mafia Room Lobby</h2>
              <p className="text-slate-400 text-sm">
                Share game code <strong className="font-mono text-purple-300 bg-slate-800 px-2 py-1 rounded">{gameCode}</strong> with your players to join.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-indigo-950/60 pb-2">
                <h3 className="text-sm font-semibold tracking-widest uppercase text-indigo-400">
                  Joined Players ({mafiaState.players.length})
                </h3>
                <span className="text-xs text-slate-500">
                  Minimum {MAFIA_MIN_PLAYERS} players required
                </span>
              </div>

              {mafiaState.players.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-dashed border-indigo-950 text-slate-500 text-sm">
                  No players have joined yet...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {mafiaState.players.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center space-x-3 p-3 bg-slate-950/80 border border-indigo-950 rounded-xl shadow-inner"
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-700/50 flex items-center justify-center font-bold text-purple-300 text-xs">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-200 text-sm truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-indigo-950/80">
              <HostLobbyWaitingFooter
                gameCode={gameCode}
                hostToken={hostToken}
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
              />
            </div>
          </div>
        </main>
      </div>
    )
  }

  const {
    phase,
    dayNumber,
    phaseDeadline,
    players,
    winningTeam,
    doctorTargetPlayerId,
    detectTargetPlayerId,
    mafiaTargetPlayerId,
    lastNightKillPlayerId,
    lastVoteResultPlayerId,
  } = mafiaState

  const activePlayers = players.filter((p) => p.isAlive)
  const deadPlayers = players.filter((p) => !p.isAlive)

  // Find names helper
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name ?? 'None'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="px-6 py-4 border-b border-indigo-950 bg-slate-900 flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">👁️</span>
          <div>
            <h1 className="font-extrabold text-lg text-purple-300">Narrator Dashboard</h1>
            <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold">Game Code: {gameCode}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-xs font-mono bg-slate-800 px-3 py-1 rounded border border-slate-700 text-slate-400">
            Host Mode
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  onClick={() => advancePhase('discussion')}
                  className="py-2 bg-indigo-950/50 hover:bg-indigo-900/60 text-xs font-medium rounded border border-indigo-900/40 transition"
                >
                  Force Discussion
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
                    {phase === 'voting' && (
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
      </main>
    </div>
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
