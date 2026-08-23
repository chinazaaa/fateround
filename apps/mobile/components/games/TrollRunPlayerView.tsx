/**
 * Troll Run — the on-phone player view.
 *
 * Structure mirrors the web view (`src/components/troll-run/TrollRunPlayerView.tsx`) because the
 * two are in the same race: join → lobby → countdown → racing → between-round scoreboard →
 * championship. The simulation itself is the shared engine, wrapped by `TrollRunStage`.
 *
 * Two things worth knowing before changing anything here:
 *
 *  - **The level order is drawn once, by the server.** `session.level_order` names each level
 *    (authored id, mirrored variant, or a generated descriptor carrying its seed), and
 *    `resolveTrollRunLevels` rebuilds it locally. Everyone therefore runs the exact sequence the
 *    server scores against, with no level geometry on the wire.
 *  - **Progress is server-authoritative.** Clearing a level is a claim posted to
 *    `/api/troll-run/report-clear`; the stage does not advance the round on its own. A report that
 *    never lands strands the runner, which is why `postTrollRunClear` retries once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player, TrollRunEvent, TrollRunPlayerState, TrollRunSession } from '@fateround/shared'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import {
  buildTrollRunChampionshipStandings,
  selectTrollRunRoundStates,
  trollRunRoundLevelCount,
} from '@fateround/shared/troll-run-standings'
import {
  resolveTrollRunLevels,
  TROLL_RUN_MIN_PLAYERS,
  type GhostPositionPayload,
  type TrollRunEngine,
} from '@fateround/shared/troll-run-engine'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { TrollRunStage } from '@/components/games/troll-run/TrollRunStage'
import { TrollRunRaceProgress } from '@/components/games/troll-run/TrollRunRaceProgress'
import { TrollRunLiveFeed, TROLL_RUN_FEED_HISTORY } from '@/components/games/troll-run/TrollRunLiveFeed'
import { TrollRunScoreboard } from '@/components/games/troll-run/TrollRunScoreboard'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useTrollRunAdvanceNudge } from '@/hooks/useTrollRunAdvanceNudge'
import { usePlayerSessionActions } from '@/lib/player-session'
import { useHostView } from '@/components/host/HostViewContext'
import { postTrollRunClear, postTrollRunDeath, postTrollRunNextRound, postTrollRunRoundFinish } from '@/lib/game-api'
import { trollRunLeaderboard } from '@/lib/finish-leaderboards'
import { gameLabel } from '@/lib/mobile-registry'
import { getSupabase } from '@/lib/supabase'
import { TROLL_RUN_EVENT_SELECT, TROLL_RUN_PLAYER_STATE_SELECT, TROLL_RUN_SESSION_SELECT } from '@/lib/supabase-selects'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'

/** Seconds left on the round clock below which the timer reads as urgent. */
const URGENT_SECONDS = 20

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function TrollRunPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const label = gameLabel('troll_run')

  const [session, setSession] = useState<TrollRunSession | null>(null)
  const [playerStates, setPlayerStates] = useState<TrollRunPlayerState[]>([])
  const [events, setEvents] = useState<TrollRunEvent[]>([])

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const supabase = getSupabase()
    const [sessionRes, statesRes, eventsRes] = await Promise.all([
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

    setSession((sessionRes.data as unknown as TrollRunSession | null) ?? null)
    setPlayerStates((statesRes.data as unknown as TrollRunPlayerState[]) ?? [])
    setEvents(((eventsRes.data as unknown as TrollRunEvent[]) ?? []).slice().reverse())

    return { state: null, ok: !sessionRes.error }
  }, [gameCode])

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'active'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)
  // Present only when this view is rendered inside the host's own screen. Leaving the scoreboard
  // for the next round is the one Troll Run transition no deadline produces, so it needs the host
  // token — without it the room would sit on the round results forever.
  const host = useHostView()
  const [advancing, setAdvancing] = useState(false)

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      { table: 'troll_run_sessions', apply: (row) => setSession(row as unknown as TrollRunSession) },
      {
        table: 'troll_run_player_states',
        apply: (row) => {
          const next = row as unknown as TrollRunPlayerState
          setPlayerStates((prev) => {
            const index = prev.findIndex((state) => state.id === next.id)
            if (index < 0) return [...prev, next]
            const updated = [...prev]
            updated[index] = next
            return updated
          })
        },
      },
      {
        table: 'troll_run_events',
        apply: (row) => {
          const next = row as unknown as TrollRunEvent
          setEvents((prev) =>
            prev.some((existing) => existing.id === next.id) ? prev : [...prev, next].slice(-TROLL_RUN_FEED_HISTORY)
          )
        },
      },
    ],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  useTrollRunAdvanceNudge({ gameCode, session })

  // `turn_deadline_at` already is the deadline, so the shared countdown gets no extra delay.
  const deadlineSecondsLeft = useDeadlineCountdown(
    session?.turn_deadline_at,
    0,
    session?.phase === 'countdown' || session?.phase === 'racing'
  )

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const player of bootstrap.players) map.set(player.id, player.name)
    return map
  }, [bootstrap.players])

  const me = bootstrap.myPlayerId ? bootstrap.players.find((player) => player.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  const myState = useMemo(() => {
    if (!bootstrap.myPlayerId || !session) return undefined
    return selectTrollRunRoundStates(playerStates, session.current_round).find(
      (state) => state.player_id === bootstrap.myPlayerId
    )
  }, [playerStates, bootstrap.myPlayerId, session])

  const isRacing = session?.phase === 'racing'
  const hasFinishedRound = myState?.round_finished === true

  // ---------------------------------------------------------------------------
  // Ghosts
  // ---------------------------------------------------------------------------
  // Peer positions ride ephemeral Broadcast rather than the database: they are worthless a frame
  // later, and at ~20 updates a second per runner they must never pass through React state.
  const engineRef = useRef<TrollRunEngine | null>(null)
  const ghostChannelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null)

  const handleEngineReady = useCallback((engine: TrollRunEngine | null) => {
    engineRef.current = engine
  }, [])

  useEffect(() => {
    if (!gameCode || !bootstrap.myPlayerId) return

    const channel = getSupabase().channel(`realtime:troll_run_ghosts:${gameCode}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'ghost_pos' }, ({ payload }) => {
        const ghost = payload as GhostPositionPayload | null
        if (!ghost || typeof ghost.playerId !== 'string') return
        engineRef.current?.setGhostPosition(ghost)
      })
      .subscribe()

    ghostChannelRef.current = channel

    return () => {
      void channel.unsubscribe()
      ghostChannelRef.current = null
    }
  }, [gameCode, bootstrap.myPlayerId])

  const handlePlayerPosition = useCallback((position: GhostPositionPayload) => {
    void ghostChannelRef.current?.send({ type: 'broadcast', event: 'ghost_pos', payload: position })
  }, [])

  // ---------------------------------------------------------------------------
  // Race reports
  // ---------------------------------------------------------------------------
  const resumeToken = bootstrap.myResumeToken
  const handleDeath = useCallback(
    (levelId: string, levelName: string) => {
      if (!resumeToken) return
      void postTrollRunDeath(gameCode, resumeToken, levelId, levelName)
    },
    [gameCode, resumeToken]
  )

  const handleLevelClear = useCallback(
    (levelId: string, levelName: string, timeMs: number) => {
      if (!resumeToken) return
      void postTrollRunClear(gameCode, resumeToken, levelId, levelName, timeMs)
    },
    [gameCode, resumeToken]
  )

  const handleAllLevelsCleared = useCallback(() => {
    if (!resumeToken) return
    void postTrollRunRoundFinish(gameCode, resumeToken)
  }, [gameCode, resumeToken])

  // The order drawn at round start is what the server scores against, so every client runs exactly
  // that sequence. Keyed on the joined ids because each realtime session row arrives as a fresh
  // array, and reacting to its identity would tear the running engine down on every row update.
  const levelOrderKey = session?.level_order.join('|') ?? ''
  const currentWorld = session?.current_world
  const roundLevels = useMemo(
    () => resolveTrollRunLevels(levelOrderKey ? levelOrderKey.split('|') : null, currentWorld),
    [levelOrderKey, currentWorld]
  )

  const hostToken = host?.hostToken
  const onReloadHost = host?.onReload
  const handleNextRound = useCallback(async () => {
    if (!hostToken || advancing) return
    setAdvancing(true)
    try {
      await postTrollRunNextRound(gameCode, hostToken)
      await bootstrap.load()
      onReloadHost?.()
    } catch {
      // The scoreboard stays put and the button re-arms — a failed advance is safe to retry.
    } finally {
      setAdvancing(false)
    }
  }, [gameCode, hostToken, advancing, bootstrap, onReloadHost])

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }

  if (bootstrap.screen === 'join' && bootstrap.game) {
    // A race in progress still takes late runners — they are seated for the next round — but the
    // default here is a viewer seat, matching the web join copy.
    const joiningAsViewer = bootstrap.game.status === 'active'
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join(undefined, joiningAsViewer ? { joinAsViewer: true } : undefined)}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        kicker={joiningAsViewer ? 'Watch race' : 'Join race'}
        hint={
          joiningAsViewer
            ? 'Race in progress — enter a name to watch live. You can take a seat for the next round.'
            : `${TROLL_RUN_MIN_PLAYERS}–${bootstrap.game.max_players ?? 6} runners · trick levels, unlimited deaths.`
        }
      />
    )
  }

  if (bootstrap.screen === 'waiting' && lobbyProps) {
    return <LobbyView {...lobbyProps} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const standings = buildTrollRunChampionshipStandings(playerStates, playerNames)
    const top = standings[0]
    const winnerId = top && top.totalScore > 0 ? top.playerId : null
    const title = winnerId ? (bootstrap.myPlayerId === winnerId ? 'You win!' : `${top!.name} wins!`) : 'Race over'
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Championship standings"
          emoji="🏃"
          winnerPlayerId={winnerId ?? undefined}
          leaderboard={trollRunLeaderboard(standings, bootstrap.myPlayerId)}
        />
      </GameShell>
    )
  }

  // The room is active but the first round has not been drawn yet.
  if (!session || session.phase === 'lobby') {
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Setting the traps…</Text>
          <Text style={styles.noticeBody}>The first round starts in a moment.</Text>
        </View>
      </GameShell>
    )
  }

  if (session.phase === 'scoreboard') {
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <TrollRunScoreboard
          session={session}
          playerStates={playerStates}
          playerNames={playerNames}
          myPlayerId={bootstrap.myPlayerId}
        />
        {hostToken ? (
          <Pressable
            accessibilityRole="button"
            disabled={advancing}
            onPress={() => void handleNextRound()}
            style={[styles.primaryButton, advancing && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {advancing
                ? 'Starting…'
                : session.current_round < session.total_rounds
                  ? 'Start next round'
                  : 'Finish the race'}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.noticeBody}>Next round starts when the host advances the race.</Text>
        )}
      </GameShell>
    )
  }

  const levelCount = trollRunRoundLevelCount(session)
  const roundClockSeconds = isRacing ? deadlineSecondsLeft : session.round_time_limit

  const hudBar = (
    <View style={styles.hud}>
      <Text style={styles.hudRound}>
        Round {session.current_round} / {session.total_rounds}
      </Text>
      <Text style={styles.hudWorld}>{session.current_world}</Text>
      <Text style={[styles.hudClock, isRacing && roundClockSeconds <= URGENT_SECONDS && styles.hudClockUrgent]}>
        ⏱ {formatClock(roundClockSeconds)}
      </Text>
    </View>
  )

  // Watching rather than running — viewers, and anyone with no row in this round.
  if (isViewer || !myState) {
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {hudBar}
          <Text style={styles.noticeBody}>
            {isViewer ? 'You are watching this race.' : 'You will be seated for the next round.'}
          </Text>
          <TrollRunRaceProgress session={session} players={bootstrap.players} playerStates={playerStates} />
          <TrollRunLiveFeed events={events} playerNames={playerNames} />
        </ScrollView>
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {hudBar}

        <View style={styles.statRow}>
          <Text style={styles.stat}>
            🎯 {Math.min(myState.current_level_index + 1, levelCount)}/{levelCount}
          </Text>
          <Text style={[styles.stat, styles.statDeaths]}>💀 {myState.deaths}</Text>
        </View>

        {session.phase === 'countdown' ? (
          <View style={styles.overlay}>
            <Text style={styles.countdown}>{deadlineSecondsLeft > 0 ? deadlineSecondsLeft : 'GO!'}</Text>
            <Text style={styles.noticeBody}>Get ready to race!</Text>
          </View>
        ) : null}

        {hasFinishedRound && isRacing ? (
          <View style={styles.overlay}>
            <Text style={styles.noticeTitle}>All levels cleared!</Text>
            <Text style={styles.noticeBody}>
              You cleared all {levelCount} levels in {(myState.total_time_ms / 1000).toFixed(1)}s with {myState.deaths}{' '}
              deaths.
            </Text>
            <Text style={styles.noticeFaint}>
              Places and points are decided once every runner is home or the timer runs out.
            </Text>
          </View>
        ) : null}

        <TrollRunStage
          levels={roundLevels}
          initialLevelIndex={Math.min(myState.current_level_index, Math.max(0, roundLevels.length - 1))}
          playerId={bootstrap.myPlayerId ?? ''}
          playerName={playerNames.get(bootstrap.myPlayerId ?? '') ?? 'Runner'}
          active={isRacing && !hasFinishedRound}
          theme={(bootstrap.game.theme as 'dark' | 'retro' | 'neon') || 'dark'}
          onEngineReady={handleEngineReady}
          onPlayerPosition={handlePlayerPosition}
          onDeath={handleDeath}
          onLevelClear={handleLevelClear}
          onAllLevelsCleared={handleAllLevelsCleared}
        />

        <TrollRunLiveFeed events={events} playerNames={playerNames} />
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scroll: { gap: theme.space.sm, paddingBottom: theme.space.xl },
    hud: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
      paddingHorizontal: theme.space.md,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    hudRound: { color: theme.primary, fontSize: theme.type.caption.size, fontWeight: '800' },
    hudWorld: { color: theme.textMuted, fontSize: theme.type.caption.size, textTransform: 'capitalize' },
    hudClock: { color: theme.text, fontSize: theme.type.caption.size, fontWeight: '700' },
    hudClockUrgent: { color: theme.error },
    statRow: { flexDirection: 'row', gap: theme.space.md },
    stat: { color: theme.text, fontSize: theme.type.label.size, fontWeight: '700' },
    statDeaths: { color: theme.error },
    overlay: {
      alignItems: 'center',
      gap: 4,
      padding: theme.space.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.surface,
    },
    countdown: { color: theme.primary, fontSize: 48, fontWeight: '900' },
    notice: {
      alignItems: 'center',
      gap: 6,
      padding: theme.space.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    noticeTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', textAlign: 'center' },
    noticeBody: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
    noticeFaint: { color: theme.textFaint, fontSize: 11, fontStyle: 'italic', textAlign: 'center' },
    primaryButton: {
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: theme.radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonDisabled: { opacity: 0.6 },
    primaryButtonText: { color: theme.bg, fontSize: theme.type.label.size, fontWeight: '800' },
  })
