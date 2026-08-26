'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { usePolling, POLL_INTERVALS, supabasePollOk } from '@/hooks/usePolling'
import { useRoomMemberJoin } from '@/hooks/useRoomMemberJoin'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useTrollRunAdvanceNudge } from '@/hooks/useTrollRunAdvanceNudge'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { TROLL_RUN_EVENT_SELECT, TROLL_RUN_PLAYER_STATE_SELECT, TROLL_RUN_SESSION_SELECT } from '@/lib/supabase-selects'
import type { Game, Player, TrollRunEvent, TrollRunPlayerState, TrollRunSession } from '@/types'
import { resolveTrollRunLevels, type GhostPositionPayload, type TrollRunEngine } from '@/lib/troll-run-engine'
import { trollRunRoundLevelCount } from '@/lib/troll-run'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { Glyph } from '@/components/icons/Glyph'
import { gameIcon } from '@/lib/game-glyphs'
import { Clock01Icon, Flag02Icon, SkullIcon, Target01Icon } from '@hugeicons/core-free-icons'
import { TrollRunCanvas, TROLL_RUN_STAGE_MAX_WIDTH } from './TrollRunCanvas'
import { TrollRunLiveFeed, TROLL_RUN_FEED_HISTORY } from './TrollRunLiveFeed'
import { TrollRunRaceProgress } from './TrollRunRaceProgress'
import { TrollRunScoreboard } from './TrollRunScoreboard'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { TROLL_RUN_MIN_PLAYERS } from '@/lib/troll-run-types'
import { preJoinScreen } from '@/lib/viewers'
import { gameTypeConfig } from '@/lib/game-types'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { clearPlayerSession } from '@/lib/utils'
import { markPlayerReady } from '@/lib/player-ready'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { LeaderboardJoinNote } from '@/components/game-lobby/LeaderboardJoinNote'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'waiting'
  | 'playing'
  | 'scoreboard'
  | 'finished'
  | 'not_found'

/** Seconds left on the round clock below which the timer reads as urgent. */
const TROLL_RUN_URGENT_SECONDS = 20

/** Haptic nudge where the device supports one; a browser that refuses is not an error. */
function vibrate(pattern: number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw when the document is not the active one.
  }
}

export interface TrollRunPlayerViewProps {
  gameCode: string
  hostToken?: string
  onNextRound?: () => void
  onPlayAgain?: () => void
  onReturnToLobby?: () => void
  onEndGameEarly?: () => void
  advancing?: boolean
  playingAgain?: boolean
  initialSession?: TrollRunSession | null
  initialPlayers?: Player[]
  initialPlayerStates?: TrollRunPlayerState[]
  initialEvents?: TrollRunEvent[]
  initialGame?: Game | null
  initialPlayerId?: string | null
  initialResumeToken?: string | null
}

export function TrollRunPlayerView({
  gameCode,
  hostToken,
  onNextRound,
  onPlayAgain,
  onReturnToLobby,
  onEndGameEarly,
  advancing = false,
  playingAgain = false,
  initialSession = null,
  initialPlayers = [],
  initialPlayerStates = [],
  initialEvents = [],
  initialGame = null,
  initialPlayerId = null,
  initialResumeToken = null,
}: TrollRunPlayerViewProps) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('troll_run')

  const [session, setSession] = useState<TrollRunSession | null>(initialSession)
  const [playerStates, setPlayerStates] = useState<TrollRunPlayerState[]>(initialPlayerStates)
  const [events, setEvents] = useState<TrollRunEvent[]>(initialEvents)

  useEffect(() => {
    if (initialSession) setSession(initialSession)
  }, [initialSession])

  useEffect(() => {
    if (initialPlayerStates && initialPlayerStates.length > 0) setPlayerStates(initialPlayerStates)
  }, [initialPlayerStates])

  useEffect(() => {
    if (initialEvents && initialEvents.length > 0) setEvents(initialEvents)
  }, [initialEvents])

  const { joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessRes, statesRes, eventsRes] = await Promise.all([
      supabase.from('troll_run_sessions').select(TROLL_RUN_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('troll_run_player_states').select(TROLL_RUN_PLAYER_STATE_SELECT).eq('game_id', gameCode),
      // Newest first with a cap, flipped back into feed order below: a race logs a death for every
      // trap every runner falls for, and only the tail is ever shown.
      supabase
        .from('troll_run_events')
        .select(TROLL_RUN_EVENT_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(TROLL_RUN_FEED_HISTORY),
    ])

    // A read that failed is not an empty room. Blanking on an error unmounts the canvas mid-race,
    // which restarts the run and wipes every ghost; the last good snapshot survives instead.
    if (supabasePollOk(sessRes)) setSession(sessRes.data ? (sessRes.data as unknown as TrollRunSession) : null)
    if (supabasePollOk(statesRes)) setPlayerStates((statesRes.data as unknown as TrollRunPlayerState[]) ?? [])
    if (supabasePollOk(eventsRes)) setEvents(((eventsRes.data as unknown as TrollRunEvent[]) ?? []).slice().reverse())

    // `ok` gates the polling fallback's back-off, so it holds only when every read landed.
    return { state: null, ok: supabasePollOk(sessRes, statesRes, eventsRes) }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null): Screen => {
      const effectiveId = playerId || initialPlayerId
      if (!effectiveId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'finished') return 'finished'
      return 'playing'
    },
    [initialPlayerId]
  )

  const {
    screen,
    game,
    players,
    setPlayers,
    myPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  const effectiveMyPlayerId = myPlayerId || initialPlayerId
  const effectiveMyResumeToken = myResumeToken || initialResumeToken
  const effectivePlayers = players.length > 0 ? players : initialPlayers
  const effectiveGame = game || initialGame

  useApplyGameTheme(effectiveGame?.theme, effectiveGame?.game_type)

  // Realtime subscription
  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
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
      {
        table: 'troll_run_sessions',
        apply: (row) => setSession(row as unknown as TrollRunSession),
      },
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
            if (prev.some((existing) => existing.id === rowObj.id)) return prev
            return [...prev, rowObj].slice(-TROLL_RUN_FEED_HISTORY)
          })
        },
      },
    ],
    load,
    { channelKey: 'player' }
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  useTrollRunAdvanceNudge({ gameCode, session, resumeToken: effectiveMyResumeToken })

  // `turn_deadline_at` already is the deadline, so the shared countdown gets no extra delay.
  const deadlineSecondsLeft = useDeadlineCountdown(
    session?.turn_deadline_at,
    0,
    session?.phase === 'countdown' || session?.phase === 'racing'
  )

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const player of effectivePlayers) {
      map.set(player.id, player.name)
    }
    return map
  }, [effectivePlayers])

  const myState = useMemo(() => {
    if (!effectiveMyPlayerId || !session) return undefined
    return playerStates.find(
      (state) => state.player_id === effectiveMyPlayerId && state.current_round === session.current_round
    )
  }, [playerStates, effectiveMyPlayerId, session])

  const isViewer = useMemo(() => {
    return effectivePlayers.find((player) => player.id === effectiveMyPlayerId)?.spectator === true
  }, [effectivePlayers, effectiveMyPlayerId])

  const isRacing = session?.phase === 'racing'
  const hasFinishedRound = myState?.round_finished === true
  const shouldPlayTimerSound = Boolean(isRacing && !isViewer && !hasFinishedRound)
  useTimerTickSound(deadlineSecondsLeft, shouldPlayTimerSound, 10)

  const me = useMemo(
    () => effectivePlayers.find((player) => player.id === effectiveMyPlayerId),
    [effectivePlayers, effectiveMyPlayerId]
  )

  const playerSettingsNode = useMemo(() => {
    if (!effectiveMyPlayerId || hostToken) return null
    return (
      <div className="space-y-3">
        <RulesInPlaySection game={effectiveGame} />
        <EditNameInline
          gameCode={gameCode}
          playerId={effectiveMyPlayerId}
          currentName={me?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={effectiveMyPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the room is still open."
        />
      </div>
    )
  }, [effectiveGame, effectiveMyPlayerId, hostToken, gameCode, me?.name, isViewer, load, router])
  // Skip registration when embedded by host view (the host chrome already renders EditNameInline for the host's seat)
  useRegisterGameSettings(playerSettingsNode, !hostToken)

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!effectiveMyResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: effectiveMyResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, effectiveMyResumeToken, load, toastError]
  )

  const engineRef = useRef<TrollRunEngine | null>(null)
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const ghostChannelJoinedRef = useRef(false)

  const handleEngineReady = useCallback((engine: TrollRunEngine | null) => {
    engineRef.current = engine
  }, [])

  // Peer positions ride ephemeral Broadcast rather than the database: they are worthless a frame
  // later, and at ~20 updates a second per runner they must never pass through React state.
  useEffect(() => {
    if (!gameCode || !effectiveMyPlayerId) return

    const channel = supabase.channel(`realtime:troll_run_ghosts:${gameCode}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'ghost_pos' }, ({ payload }) => {
        const ghost = payload as GhostPositionPayload | null
        if (!ghost || typeof ghost.playerId !== 'string') return
        engineRef.current?.setGhostPosition(ghost)
      })
      .subscribe((status) => {
        ghostChannelJoinedRef.current = status === 'SUBSCRIBED'
      })

    broadcastChannelRef.current = channel

    return () => {
      ghostChannelJoinedRef.current = false
      broadcastChannelRef.current = null
      // `unsubscribe` alone leaves the channel registered with its rejoin timer live, so remounts
      // pile zombie channels onto the one socket and their joins count against the realtime limits.
      void supabase.removeChannel(channel)
    }
  }, [gameCode, effectiveMyPlayerId])

  const handlePlayerPosition = useCallback((position: GhostPositionPayload) => {
    const channel = broadcastChannelRef.current
    // Off the socket, `send` posts one REST request per message on a 10s timeout; at 20 frames a
    // second those queue and land seconds late and out of order, which is the ghost stutter. Both
    // halves of realtime-js's `canPush()` are checked — the status callback never reports the
    // socket, which can drop long after the channel said SUBSCRIBED — and a frame that cannot go
    // out now is dropped, since a position is worthless a frame later.
    if (!channel || !ghostChannelJoinedRef.current || !channel.socket.isConnected()) return
    channel.send({ type: 'broadcast', event: 'ghost_pos', payload: position }).catch(() => {
      // Ghosts are cosmetic; a dropped frame is replaced 50ms later.
    })
  }, [])

  // The order drawn at round start is what the server scores against, so every client runs exactly
  // that sequence. Keyed on the joined ids because each realtime session row arrives as a fresh
  // array, and reacting to its identity would tear the running engine down on every row update.
  const levelOrderKey = session?.level_order.join('|') ?? ''
  const currentWorld = session?.current_world
  const roundLevels = useMemo(() => {
    return resolveTrollRunLevels(levelOrderKey ? levelOrderKey.split('|') : null, currentWorld)
  }, [levelOrderKey, currentWorld])

  /**
   * Posts one in-race report. Progress is server-authoritative, so a report that never lands
   * strands the runner on that level for the rest of the round — worth one retry on a network blip
   * or a server fault. A refusal is a decision the server already made (round over, level already
   * cleared) and repeating the request would only get the same answer, so the refusal is handed
   * back instead: it carries the progress the server actually holds.
   */
  const postRaceReport = useCallback(
    async (
      path: string,
      payload: Record<string, unknown>
    ): Promise<{ ok: boolean; body: Record<string, unknown> | null }> => {
      if (!effectiveMyResumeToken) return { ok: false, body: null }
      const body = JSON.stringify({ gameId: gameCode, resumeToken: effectiveMyResumeToken, ...payload })

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
          const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null
          if (res.ok) return { ok: true, body: parsed }
          if (res.status < 500) return { ok: false, body: parsed }
        } catch {
          // Network blip — worth exactly one more try.
        }
      }
      return { ok: false, body: null }
    },
    [gameCode, effectiveMyResumeToken]
  )

  const handleDeath = useCallback(
    (levelId: string, levelName: string) => {
      vibrate([40, 60, 40])
      void postRaceReport('/api/troll-run/report-death', { levelId, levelName })
    },
    [postRaceReport]
  )

  const handleLevelClear = useCallback(
    (levelId: string, levelName: string, timeMs: number) => {
      vibrate([50, 50, 100])
      void postRaceReport('/api/troll-run/report-clear', {
        levelId,
        levelName,
        timeMs: Math.max(0, Math.round(timeMs)),
      })
    },
    [postRaceReport]
  )

  const handleAllLevelsCleared = useCallback(() => {
    vibrate([100, 50, 100, 50, 200])
    // Nothing about the result is sent: the server accepts the claim only if its own progress row
    // shows every level cleared, and reads the finishing time off the shared round clock.
    void postRaceReport('/api/troll-run/report-round-finish', {}).then((outcome) => {
      if (outcome.ok) return

      // Refused because the server still holds levels this runner has played, so a clear report
      // never landed. The engine has stopped itself by now, which would end the round on the
      // clear chime with no way back in — put them on the level the server is waiting for.
      const resumeIndex = outcome.body?.currentLevelIndex
      if (typeof resumeIndex === 'number' && resumeIndex < roundLevels.length) {
        engineRef.current?.start(resumeIndex)
      }
    })
  }, [postRaceReport, roundLevels.length])

  const handleEndGameEarly = useCallback(async () => {
    await onEndGameEarly?.()
    await load()
  }, [onEndGameEarly, load])

  // 1. Join Screen
  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        onResumed={load}
        wide
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="troll_run"
            subtitle={cfg.tagline}
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="troll_run"
        />
        {lobbyFull && !joiningAsViewer && (
          <div className="space-y-2 text-center">
            <p className="text-faint text-xs leading-relaxed">This race is full — you can watch.</p>
            <button
              type="button"
              onClick={() => void join({ joinAsViewer: true })}
              disabled={joining}
              className="btn-secondary w-full"
            >
              Watch instead
            </button>
          </div>
        )}
        <LeaderboardJoinNote gameType="troll_run" />
        <p className="text-faint text-xs leading-relaxed text-center">
          {joiningAsViewer
            ? 'This race is in progress — you will join as a spectator and watch live (read-only).'
            : `${TROLL_RUN_MIN_PLAYERS}–${game?.max_players ?? 6} runners · ${game?.troll_run_rounds ?? 5} rounds · ${game?.troll_run_world ?? 'pits'} world.`}
        </p>
      </GameJoinLobbyShell>
    )
  }

  // 2. Game Started Waiting (Late spectator)
  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  // 3. Lobby Waiting Room
  if (screen === 'waiting' || game?.status === 'waiting') {
    const me = players.find((player) => player.id === myPlayerId)
    const displayName = me?.name ?? 'Player'
    const isSpectator = me?.spectator === true

    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={TROLL_RUN_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={() => {
              clearPlayerSession(gameCode)
              router.push('/')
            }}
          />
        </GameJoinLobbyShell>
      )
    }

    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={displayName}
          onRenamed={() => {
            void load()
          }}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          title={isSpectator ? 'Ready for another race?' : 'Waiting for host to start'}
          gameType={game?.game_type}
          game={game}
          capacityGame={game}
          description={`Waiting for the host to start. Race through ${game?.troll_run_rounds ?? 3} rounds of trick levels with the fewest deaths.`}
          rulesLink={<GameRulesLink gameType="troll_run" variant="subtle" />}
          playerListLabel="Runners"
          isSpectator={isSpectator}
          onReady={async () => {
            if (!myResumeToken) return
            await markPlayerReady(gameCode, myResumeToken)
            await load()
          }}
          onReadyError={toastError}
        />
      </GameJoinLobbyShell>
    )
  }

  // 4. Game Ended / Finished
  if (game?.status === 'finished' || screen === 'finished' || session?.phase === 'finished') {
    const effectiveSession: TrollRunSession = session ?? {
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

    return (
      <div className="page-wrap flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-8">
        <TrollRunScoreboard
          session={effectiveSession}
          playerStates={playerStates}
          playerNames={playerNames}
          isHost={Boolean(hostToken)}
          onNextRound={onNextRound}
          loading={advancing}
          gameCode={gameCode}
          hostToken={hostToken}
          onEndGameEarly={handleEndGameEarly}
          myPlayerId={myPlayerId}
          onPlayAgain={onPlayAgain}
          onReturnToLobby={onReturnToLobby}
          playingAgain={playingAgain}
        />
      </div>
    )
  }

  // 5. Scoreboard between rounds
  if (session?.phase === 'scoreboard') {
    return (
      <div className="page-wrap flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-8">
        <TrollRunScoreboard
          session={session}
          playerStates={playerStates}
          playerNames={playerNames}
          isHost={Boolean(hostToken)}
          onNextRound={onNextRound}
          loading={advancing}
          gameCode={gameCode}
          hostToken={hostToken}
          onEndGameEarly={handleEndGameEarly}
          myPlayerId={myPlayerId}
          onPlayAgain={onPlayAgain}
          onReturnToLobby={onReturnToLobby}
          playingAgain={playingAgain}
        />
      </div>
    )
  }

  // 6. The room is active but the first round has not been drawn yet.
  if (!session || session.phase === 'lobby') {
    return (
      <div className="page-wrap flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-8">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 backdrop-blur-md p-6 sm:p-8 space-y-3 text-center max-w-sm w-full shadow-2xl">
          <div className="flex justify-center text-[var(--primary)] pb-1">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
              <Glyph icon={gameIcon('troll_run')} size={18} />
            </span>
          </div>
          <h2 className="text-xl font-black text-[var(--foreground)]">Setting the traps…</h2>
          <p className="text-muted text-xs leading-relaxed">The first round starts in a moment.</p>
        </div>
      </div>
    )
  }

  const levelCount = trollRunRoundLevelCount(session)
  const roundClockSeconds = isRacing ? deadlineSecondsLeft : session.round_time_limit

  // 7. Watching rather than running — viewers, and anyone with no row in this round.
  if (isViewer || !myState) {
    return (
      <div className="page-wrap mx-auto max-w-2xl space-y-4 px-4 py-5">
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
          <span className="flex items-center gap-1.5 font-black text-[var(--primary)]">
            <Glyph icon={Flag02Icon} size={13} />
            Round {session.current_round} / {session.total_rounds}
          </span>
          <span className="text-muted capitalize">{session.current_world}</span>
          <span className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-[var(--foreground)]">
            <Glyph icon={Clock01Icon} size={13} className="text-muted" />
            {formatMinutesSeconds(roundClockSeconds)}
          </span>
        </div>
        <p className="text-muted text-center text-xs">
          {isViewer ? 'You are watching this race.' : 'You will be seated for the next round.'}
        </p>
        <TrollRunRaceProgress session={session} players={players} playerStates={playerStates} />
        <TrollRunLiveFeed events={events} playerNames={playerNames} />
        {hostToken ? (
          <div className="pt-3">
            <HostEndGameButton
              gameCode={gameCode}
              hostToken={hostToken}
              onEnded={load}
              label="End race"
              icon={<ExitIcon size={12} />}
              confirmTitle="End this Troll Run race?"
              confirmMessage="The match will end immediately and all players will see the championship results."
              className="btn-danger-soft"
            />
          </div>
        ) : myPlayerId ? (
          <div className="pt-3">
            <LeaveGameButton
              gameCode={gameCode}
              playerId={myPlayerId}
              onLeft={() => {
                clearPlayerSession(gameCode)
                router.push('/')
              }}
              className="btn-secondary w-full text-xs"
            />
          </div>
        ) : null}
      </div>
    )
  }

  // 8. Racing / countdown
  return (
    <div className="page-wrap flex flex-col items-center gap-3 px-2 sm:px-4 py-2 sm:py-4 select-none w-full">
      {/* Top HUD Bar */}
      <div
        className="glass-card flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5 text-xs"
        style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center text-[var(--primary)] shrink-0">
            <Glyph icon={gameIcon('troll_run')} size={12} />
          </span>
          <span className="font-black text-[var(--primary)]">
            Round {session.current_round} / {session.total_rounds}
          </span>
          <span className="text-faint">·</span>
          <span className="text-muted capitalize">{session.current_world}</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="flex items-center gap-1.5" title="Level">
            <Glyph icon={Target01Icon} size={13} className="text-muted" />
            <span className="font-mono font-bold tabular-nums text-[var(--foreground)]">
              {Math.min(myState.current_level_index + 1, levelCount)}/{levelCount}
            </span>
          </span>
          <span className="flex items-center gap-1.5" title="Deaths">
            <Glyph icon={SkullIcon} size={13} className="text-rose-400" />
            <span className="font-mono font-bold tabular-nums text-rose-400">{myState.deaths}</span>
          </span>
          <span className="flex items-center gap-1.5" title="Time remaining">
            <Glyph
              icon={Clock01Icon}
              size={13}
              className={isRacing && roundClockSeconds <= TROLL_RUN_URGENT_SECONDS ? 'text-rose-400' : 'text-muted'}
            />
            <span
              className={`font-mono font-bold tabular-nums ${
                isRacing && roundClockSeconds <= TROLL_RUN_URGENT_SECONDS
                  ? 'text-rose-400 animate-pulse'
                  : 'text-[var(--foreground)]'
              }`}
            >
              {formatMinutesSeconds(roundClockSeconds)}
            </span>
          </span>
        </div>
      </div>

      {/* Main Canvas / Overlay */}
      <div className="relative w-full flex flex-col items-center" style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}>
        {/* 3-2-1 Countdown Overlay */}
        {session.phase === 'countdown' && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border backdrop-blur-sm"
            style={{
              background: 'color-mix(in srgb, var(--background) 88%, transparent)',
              borderColor: 'color-mix(in srgb, var(--primary) 40%, var(--border))',
            }}
          >
            <span className="text-7xl font-black tabular-nums text-[var(--primary)] animate-bounce">
              {deadlineSecondsLeft > 0 ? deadlineSecondsLeft : 'GO!'}
            </span>
            <p className="text-muted mt-2 text-sm font-bold">Get ready to race!</p>
          </div>
        )}

        {/* Finished Round Waiting Overlay */}
        {hasFinishedRound && isRacing && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center backdrop-blur-sm"
            style={{
              background: 'color-mix(in srgb, var(--background) 88%, transparent)',
              borderColor: 'color-mix(in srgb, #10b981 40%, var(--border))',
            }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <Glyph icon={Flag02Icon} size={24} />
            </span>
            <h3 className="text-2xl font-black text-[var(--foreground)]">All levels cleared!</h3>
            <p className="text-muted text-xs">
              You cleared all {levelCount} levels in{' '}
              <strong className="font-mono tabular-nums text-emerald-400">
                {(myState.total_time_ms / 1000).toFixed(1)}s
              </strong>{' '}
              with <strong className="font-mono tabular-nums text-rose-400">{myState.deaths} deaths</strong>.
            </p>
            <p className="text-faint text-[11px] italic">
              Places and points are decided once every runner is home or the timer runs out.
            </p>
          </div>
        )}

        <TrollRunCanvas
          levels={roundLevels}
          initialLevelIndex={Math.min(myState.current_level_index, Math.max(0, roundLevels.length - 1))}
          playerId={myPlayerId ?? ''}
          playerName={playerNames.get(myPlayerId ?? '') ?? 'Runner'}
          active={isRacing && !hasFinishedRound}
          onEngineReady={handleEngineReady}
          onPlayerPosition={handlePlayerPosition}
          onDeath={handleDeath}
          onLevelClear={handleLevelClear}
          onAllLevelsCleared={handleAllLevelsCleared}
          showTouchControls={true}
          theme={(game?.theme as 'dark' | 'retro' | 'neon') || 'dark'}
        />
      </div>

      {/* Live Death/Clear Feed */}
      <div className="w-full" style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}>
        <TrollRunLiveFeed events={events} playerNames={playerNames} />
      </div>
    </div>
  )
}
