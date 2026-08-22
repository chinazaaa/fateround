'use client'

import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import type { MafiaPhase, MafiaTeam, MafiaRole, Game, GameStatus, Player, ThemeId } from '@/types'
import { MAFIA_MIN_PLAYERS } from '@/lib/mafia'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout, type HostTab } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostMafiaLobbyPanel } from '@/components/host-lobby/HostMafiaLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { MAFIA_ROLE_INFO, MAFIA_TEAM_ROLES, NO_NIGHT_ACTION_ROLES } from '@/components/mafia/mafia-role-info'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { MafiaPlayerView } from '@/components/mafia/MafiaPlayerView'
import { EditNameInline } from '@/components/ui/EditNameInline'

const WINNING_TEAM_LABEL: Record<string, string> = {
  mafia: 'MAFIA 🔪',
  village: 'VILLAGE 🏘️',
  jester: 'JESTER 🃏',
  serial_killer: 'SERIAL KILLER 🔪',
  arsonist: 'ARSONIST 🔥',
  lovers: 'LOVERS 💘',
}
const WINNING_TEAM_COLOR: Record<string, string> = {
  mafia: 'text-red-500',
  village: 'text-emerald-400',
  jester: 'text-amber-400',
  serial_killer: 'text-amber-400',
  arsonist: 'text-orange-400',
  lovers: 'text-pink-400',
}

interface HostPlayer {
  id: string
  seatNumber: number
  name: string
  isAlive: boolean
  role: MafiaRole
  deathDay: number | null
  deathCause: string | null
  nightActionTargetPlayerId: string | null
  dayVoteTargetPlayerId: string | null
  spectator: boolean
}

interface MafiaHostStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  maxPlayers?: number
  timerSeconds?: number
  daySeconds?: number
  votingSeconds?: number
  advancedMode?: boolean
  doctorEnabled: boolean
  detectiveEnabled: boolean
  auraSeerEnabled: boolean
  anonymousVotes: boolean
  replayPending: boolean
  theme?: ThemeId
  isPublic?: boolean
  winningTeam: (MafiaTeam | 'lovers') | null
  players: HostPlayer[]
  lastNightKillPlayerId: string | null
  lastVoteResultPlayerId: string | null
  mafiaTargetPlayerId: string | null
  doctorTargetPlayerId: string | null
  auraSeerTargetPlayerId: string | null
}

export function MafiaHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  const { confirm } = useConfirm()
  const [mafiaState, setMafiaState] = useState<MafiaHostStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  // Two `load()` calls can be in flight at once (e.g. two lobby-settings changes fired close
  // together each trigger their own reload) — plain fetches have no ordering guarantee, so a
  // slower/older call's response arriving after a newer one would silently overwrite it with
  // stale state. This sequence guard makes only the most recently issued call's response apply.
  const loadSeqRef = useRef(0)
  const [tab, setTab] = useState<HostTab>('manage')

  // Fetch host state
  const load = useCallback(async (): Promise<{ state: MafiaHostStateResponse | null; ok: boolean }> => {
    const seq = ++loadSeqRef.current
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
      if (loadSeqRef.current === seq) setMafiaState(data)
      return { state: data, ok: true }
    } catch {
      return { state: null, ok: false }
    }
  }, [gameCode, hostToken])

  useEffect(() => {
    load()
  }, [load])

  useApplyGameTheme(mafiaState?.theme)

  // Table sync triggers state reload. Distinct channelKey — when the host is seated,
  // MafiaPlayerView is rendered nested inside this view and runs its own
  // useGameTableSync(gameCode, ...) with no key; two subscribers on the same default
  // `sync-<code>` topic throws "cannot add postgres_changes callbacks after subscribe()".
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'mafia_sessions', 'mafia_player_states'],
    () => {
      void load()
    },
    { channelKey: 'host' }
  )

  // Polling fallback — only while realtime is disconnected.
  usePolling(
    () => {
      void load()
    },
    [gameCode, load],
    {
      intervalMs: mafiaState?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
      enabled: mafiaState?.status === 'waiting' || !connected,
      runImmediately: false,
    }
  )

  const gameStatus = (mafiaState?.status as GameStatus) ?? undefined

  const gameObjForSeat = mafiaState
    ? ({
        id: gameCode,
        title: mafiaState.gameTitle || 'Mafia',
        status: mafiaState.status,
        game_type: 'mafia',
        host_token: hostToken,
        max_players: mafiaState.maxPlayers ?? 10,
        // Fields the "Rules in play" chips read from — kept in sync with the fuller
        // gameObj built below for HostGameLayout, so the ⚙ sheet during active play
        // shows the same house-rules summary that the join screen carries.
        timer_seconds: mafiaState.timerSeconds ?? 60,
        mafia_day_seconds: mafiaState.daySeconds ?? 90,
        mafia_voting_seconds: mafiaState.votingSeconds ?? 45,
        mafia_advanced_mode: mafiaState.advancedMode ?? false,
        mafia_doctor_enabled: mafiaState.doctorEnabled ?? true,
        mafia_detective_enabled: mafiaState.detectiveEnabled ?? true,
        mafia_aura_seer_enabled: mafiaState.auraSeerEnabled ?? true,
        mafia_anonymous_votes: mafiaState.anonymousVotes ?? false,
      } as unknown as Game)
    : null

  const playersForSeat = (mafiaState?.players ?? []).map((p) => ({
    id: p.id,
    spectator: p.spectator,
  }))

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
    leaveGameRemovePlayer,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus,
    players: playersForSeat,
    onReload: load,
    toast: { success: toastSuccess, error: toastError },
  })

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, (playerId) => {
    onHostSeatRemoved(playerId)
    void load()
  })

  // Keeps the host seated as "ready" (not a spectator) when the lobby reopens after
  // play-again, unless they deliberately chose "Host only" — without this the host shows
  // as "not ready" in the ready-up ring/lobby even though they intend to play.
  useHostAutoReady(gameCode, gameStatus, hostPlayerId, playersForSeat, load)

  useEffect(() => {
    if (mafiaState?.status === 'active') {
      setTab('play')
    }
  }, [mafiaState?.status])

  // Host controls for the active game live in the main-header ⚙ gear — no Manage tab,
  // gameplay (or the God View, when host-only) is always the body, roster + Remove live
  // in the drawer (fed by HostGameLayout's game/players/hostPlayerId below).
  const hostSettingsNode = useMemo(
    () =>
      mafiaState?.status === 'active' ? (
        <HostActiveSettings
          game={gameObjForSeat}
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="mafia"
          onEnded={() => void load()}
          endGameLabel="End game early"
          endGameConfirmTitle="End this game early?"
          endGameConfirmMessage="The current game will end and players will return to the lobby."
        >
          {!!hostPlayerId && (
            <EditNameInline
              gameCode={gameCode}
              playerId={hostPlayerId}
              currentName={hostPlayerName}
              onRenamed={() => void load()}
              spectating={hostMode === 'spectator'}
            />
          )}
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton
              onLeave={leaveGameRemovePlayer}
              variant="remove"
              className="btn-secondary w-full py-3 text-base"
            />
          )}
        </HostActiveSettings>
      ) : null,
    [mafiaState?.status, gameCode, hostToken, load, hostMode, hostPlayerId, hostPlayerName, leaveGameRemovePlayer]
  )
  useRegisterGameSettings(hostSettingsNode)

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
  }, [gameObjForSeat, gameCode, hostToken, load])

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
      if (hostMode === 'player' && hostPlayerId) setTab('play')
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

  const handleShare = async () => {
    if (!captureRef.current) return
    setSharing(true)
    try {
      const blob = await captureElementAsImage(captureRef.current)
      if (!blob) return
      const filename = `${shareFilenameStem(gameObj?.title ?? 'mafia')}.png`
      const result = await shareImageBlob(blob, filename)
      if (result === 'shared') toastSuccess('Shared!')
      else if (result === 'copied') toastSuccess('Image copied to clipboard')
      else toastSuccess('Image downloaded')
    } catch {
      toastError('Failed to share')
    } finally {
      setSharing(false)
    }
  }

  const handleDownload = async () => {
    if (!captureRef.current) return
    setDownloading(true)
    try {
      const blob = await captureElementAsImage(captureRef.current)
      if (!blob) return
      downloadBlobAsFile(blob, `${shareFilenameStem(gameObj?.title ?? 'mafia')}.png`)
    } catch {
      toastError('Failed to download')
    } finally {
      setDownloading(false)
    }
  }

  if (!mafiaState || !gameObjForSeat) {
    return <HostLobbySkeleton />
  }

  const isWaiting = gameStatus === 'waiting'
  const isFinished = gameStatus === 'finished' || mafiaState.phase === 'game_over'
  const canStart = mafiaState.players.filter((p) => !p.spectator).length >= MAFIA_MIN_PLAYERS
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  const gameObj = {
    ...gameObjForSeat,
    status: isFinished ? 'finished' : gameStatus,
    timer_seconds: mafiaState.timerSeconds ?? 60,
    mafia_day_seconds: mafiaState.daySeconds ?? 90,
    mafia_voting_seconds: mafiaState.votingSeconds ?? 45,
    mafia_advanced_mode: mafiaState.advancedMode ?? false,
    mafia_doctor_enabled: mafiaState.doctorEnabled ?? true,
    mafia_detective_enabled: mafiaState.detectiveEnabled ?? true,
    mafia_aura_seer_enabled: mafiaState.auraSeerEnabled ?? true,
    mafia_anonymous_votes: mafiaState.anonymousVotes ?? false,
    replay_pending: mafiaState.replayPending,
    theme: mafiaState.theme,
    is_public: mafiaState.isPublic === true,
    created_at: new Date().toISOString(),
  } as unknown as Game

  const playersList = mafiaState.players.map((p, index) => ({
    id: p.id,
    game_id: gameCode,
    name: p.name,
    gender: 'both' as const,
    identity_gender: null,
    participant_id: null,
    joined_at: new Date(Date.now() - (mafiaState.players.length - index) * 1000).toISOString(),
    spectator: p.spectator,
    is_eliminated: !p.isAlive,
  })) as unknown as Player[]

  const {
    phase,
    dayNumber,
    phaseDeadline,
    players,
    doctorTargetPlayerId,
    auraSeerTargetPlayerId,
    mafiaTargetPlayerId,
  } = mafiaState

  const activePlayers = players.filter((p) => p.isAlive && !p.spectator)
  const deadPlayers = players.filter((p) => !p.isAlive)

  // Find names helper
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name ?? 'None'

  // Watch mode: read-only God View — full visibility into every role/target, since a
  // narrating host isn't a player at risk of leaking anything to themselves.
  const watchPrimary = (
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
                <span className="text-slate-400">Aura Seer Probe:</span>
                <span className="font-semibold text-blue-400">{playerName(auraSeerTargetPlayerId)}</span>
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
                    <span className="font-bold text-slate-200">
                      #{p.seatNumber} {p.name}
                    </span>
                    <span
                      className={`block text-xs uppercase font-extrabold ${MAFIA_TEAM_ROLES.includes(p.role) ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      {MAFIA_ROLE_INFO[p.role]?.name ?? p.role}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:items-end mt-2 sm:mt-0 text-xs space-y-1">
                  {phase === 'night' && !NO_NIGHT_ACTION_ROLES.includes(p.role) && (
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
                      <span className="font-bold line-through text-slate-400">
                        #{p.seatNumber} {p.name}
                      </span>
                      <span className="block text-xs font-semibold text-red-500/80 uppercase">
                        {MAFIA_ROLE_INFO[p.role]?.name ?? p.role}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-red-400 px-2 py-0.5 bg-red-950/20 border border-red-900/30 rounded">
                    Day {p.deathDay} — {p.deathCause === 'village_vote' ? 'Voted out' : 'Killed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // Both play and watch modes render the same MafiaPlayerView — it reads its own session
  // from localStorage, which useHostSeat sets for EITHER a real player seat ("Host + play")
  // or a visible spectator row ("Host only"), so a host-only host gets the normal spectator
  // experience (viewer banner, read-only chat, no purple debug dashboard) matching what any
  // other spectator sees, instead of a bespoke "God View". The full God View below is only a
  // fallback for the rare moment hostPlayerId hasn't been seated yet.
  const playPrimary = hostPlayerId ? <MafiaPlayerView gameCode={gameCode} embedded /> : null

  const hostFinishedPanel = (
    <div className="max-w-2xl w-full mx-auto glass-card border border-[var(--border)] rounded-2xl p-8 shadow-2xl space-y-6 text-center">
      <div ref={captureRef} className="space-y-6">
        <h1 className="text-4xl font-extrabold text-[var(--primary)] animate-pulse">GAME OVER</h1>

        {mafiaState?.winningTeam ? (
          <div className="space-y-2">
            <p className="text-muted text-sm uppercase tracking-widest font-bold">Winning Team</p>
            <div className={`text-3xl font-black ${WINNING_TEAM_COLOR[mafiaState.winningTeam] ?? 'text-emerald-400'}`}>
              {WINNING_TEAM_LABEL[mafiaState.winningTeam] ?? mafiaState.winningTeam.toUpperCase()}
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
            {players
              .filter((p) => !p.spectator)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-sm p-3 rounded bg-[var(--surface-inset-bg)] border border-[var(--border)]"
                >
                  <span className="font-semibold text-muted">
                    #{p.seatNumber} {p.name}
                  </span>
                  <span
                    className={`font-mono text-xs uppercase ${MAFIA_TEAM_ROLES.includes(p.role) ? 'text-red-400' : 'text-emerald-400'}`}
                  >
                    {MAFIA_ROLE_INFO[p.role]?.name ?? p.role}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
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

        <ShareActionButtons
          shareLabel="Share results"
          onShare={handleShare}
          onDownload={handleDownload}
          sharing={sharing}
          downloading={downloading}
        />

        <CreateNewGameButton className="btn-secondary w-full py-3 text-sm sm:text-base" />
      </div>
    </div>
  )

  // Replay ready-up: a full-screen ring (matching every other board game), not nested inside
  // Manage settings — the host appears in it too (meId={hostPlayerId}) instead of being
  // invisible to their own ready-up flow.
  if (isWaiting && mafiaState.replayPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-4">
          <ReplayReadyRing
            players={playersList}
            meId={hostPlayerId}
            isHost
            minPlayers={MAFIA_MIN_PLAYERS}
            capacityGame={gameObj}
            onToggleReady={() => {}}
            onStart={() => void startGame()}
            starting={starting}
            gameCode={gameCode}
            hostToken={hostToken}
          />
          <div className="text-center">
            <button
              onClick={() => void confirmReturnToLobby()}
              className="btn-secondary py-2 px-4 text-xs font-semibold rounded-lg"
            >
              Return to lobby setup instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Fresh lobby.
  const waitingLobby = isWaiting
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={gameObj}
        gameTypeLabel={gameTypeConfig('mafia').label}
        titleMeta={<GameInfoChips game={gameObj} className="mt-2" />}
        players={playersList}
        maxPlayers={lobbyMaxPlayersFromGameClient('mafia', gameObj) ?? gameObj.max_players}
        resumeToken={hostResumeToken}
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
            spectatorLabel="Host only"
            spectatorHint="Narrate — no role, no seat"
            playerLabel="Host + play"
            playerHint="Get a role and play along"
          />
        }
        settingsChildren={
          <>
            <HostMafiaLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={gameObj}
              playerCount={playersList.filter((p) => !p.spectator).length}
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
            : `Need at least ${MAFIA_MIN_PLAYERS} players to start (${playersList.filter((p) => !p.spectator).length}/${MAFIA_MIN_PLAYERS})`
        }
        startLabel="Start Mafia game"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={() => void load()}
      />
    )
  }

  return (
    <HostGameLayout
      onRemovePlayer={removePlayer}
      gameCode={gameCode}
      status={gameObj.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={hostPlays ? 'play' : 'watch'}
      showTabs={!isFinished}
      gameStarted={!isWaiting}
      // MafiaPlayerView (playPrimary) renders its own compact header + "you're spectating"
      // banner, so HostGameLayout's copies would just duplicate them — only add ours for the
      // God View fallback (the rare moment before the host's seat/spectator row exists).
      header={playPrimary ? undefined : <HostGameHeader game={gameObj} />}
      suppressViewerBanner={!!playPrimary}
      game={gameObj}
      players={playersList}
      hostPlayerId={hostPlayerId}
      onHostRejoined={() => void load()}
      primary={playPrimary ?? watchPrimary}
      manage={hostFinishedPanel}
      finished={hostFinishedPanel}
      noManageTab
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
