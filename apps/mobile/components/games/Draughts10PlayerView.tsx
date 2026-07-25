import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  colorForPlayer,
  currentTurnPlayerId,
  legalStepsFromSquare,
  draughts10PieceWord,
} from '@fateround/shared/draughts10'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { Draughts10Board } from '@/components/games/draughts10/Draughts10Board'
import { Draughts10ShareCard } from '@/components/games/draughts10/Draughts10ShareCard'
import {
  draughts10IsTimed,
  draughts10ResultDetail,
  formatDraughts10Clock,
  liveDraughts10ClockMs,
} from '@/components/games/draughts10/draughts10-clocks'
import { useDraughts10ClockExpiry } from '@/components/games/draughts10/useDraughts10ClockExpiry'
import type { CheckersColor, Draughts10Session, Draughts10Variant, Game, GameType, Player } from '@fateround/shared'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import {
  postCheckersInternationalMove,
  postCheckersInternationalResign,
  postCheckersNigeriaHuff,
  postCheckersNigeriaMove,
  postCheckersNigeriaResign,
} from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { DRAUGHTS10_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import { gameLabel } from '@/lib/mobile-registry'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

/**
 * Shared player view for both `checkers_international` and `checkers_nigeria`
 * — the two game types differ only in board mirroring + "seed"/"piece"
 * terminology (both driven by `session.variant`, mirroring the web
 * Draughts10GamePanel), so this is one component, not a fork per game type.
 */
export function Draughts10PlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [session, setSession] = useState<Draughts10Session | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  const [resignOpen, setResignOpen] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: Draughts10Session | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('checkers10_sessions')
        .select(DRAUGHTS10_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as Draughts10Session | null) ?? null
      if (data) setSession(data)
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: Draughts10Session | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(game, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, Draughts10Session | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'checkers10_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  // The variant lives on the session row, but default from the room's game_type
  // before the session has loaded so the very first render already mirrors right.
  const gameType = (bootstrap.game?.game_type ?? 'checkers_international') as GameType
  const variant: Draughts10Variant =
    activeSession?.variant ?? (gameType === 'checkers_nigeria' ? 'nigeria' : 'international')
  const label = gameLabel(gameType)
  const word = draughts10PieceWord(variant)

  const postMove = variant === 'nigeria' ? postCheckersNigeriaMove : postCheckersInternationalMove
  const postResign = variant === 'nigeria' ? postCheckersNigeriaResign : postCheckersInternationalResign

  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'active',
  })

  const myColor: CheckersColor | null =
    bootstrap.myPlayerId && activeSession ? colorForPlayer(activeSession, bootstrap.myPlayerId) : null

  // A late joiner / spectator watches read-only (no seat, no resign, board locked).
  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  // During a forced multi-jump chain the continuing piece is the only legal mover,
  // so auto-select it — the player just taps the next landing square.
  useEffect(() => {
    if (activeSession?.must_continue_from) setSelected(activeSession.must_continue_from)
  }, [activeSession?.must_continue_from])

  const timed = activeSession ? draughts10IsTimed(activeSession) : false

  // Re-render on a 500ms cadence so the active player's clock chip counts down.
  useEffect(() => {
    if (!timed || activeSession?.status !== 'active') return
    const id = setInterval(() => setClockTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [timed, activeSession?.status, activeSession?.turn_started_at, activeSession?.current_turn])

  // Client-side flag-fall: when the on-move clock hits zero, tell the server.
  useDraughts10ClockExpiry(
    bootstrap.code,
    variant,
    activeSession,
    bootstrap.screen === 'active' && timed,
    () => void bootstrap.load()
  )

  const resign = () => {
    if (!bootstrap.myResumeToken) return
    setResignOpen(true)
  }

  const confirmResign = () => {
    if (!bootstrap.myResumeToken) return
    void (async () => {
      setActing(true)
      try {
        await postResign(bootstrap.code, bootstrap.myResumeToken!)
        setResignOpen(false)
        await bootstrap.load()
      } finally {
        setActing(false)
      }
    })()
  }

  const allowSkip = activeSession?.huffing_enabled === true
  const huffableSquares = isMyTurn && !activeSession?.must_continue_from ? (activeSession?.huffable_squares ?? []) : []

  const onSquarePress = async (row: number, col: number) => {
    if (!bootstrap.myResumeToken || !activeSession || !isMyTurn || !myColor) return
    const sq = `${row}${col}`
    const mustContinue = activeSession.must_continue_from
    const mustRemaining = activeSession.must_continue_remaining

    if (!selected && huffableSquares.includes(sq)) {
      setActing(true)
      try {
        await postCheckersNigeriaHuff(bootstrap.code, bootstrap.myResumeToken, sq)
        await bootstrap.load()
      } finally {
        setActing(false)
      }
      return
    }

    const legalTargets = new Set(
      selected
        ? legalStepsFromSquare(activeSession.board, myColor, selected, mustContinue, mustRemaining, allowSkip).map(
            (step) => step.to
          )
        : []
    )

    if (!selected) {
      const steps = legalStepsFromSquare(activeSession.board, myColor, sq, mustContinue, mustRemaining, allowSkip)
      if (steps.length > 0) setSelected(sq)
      return
    }

    if (sq !== selected && !legalTargets.has(sq)) {
      const steps = legalStepsFromSquare(activeSession.board, myColor, sq, mustContinue, mustRemaining, allowSkip)
      if (steps.length > 0) setSelected(sq)
      return
    }

    if (!legalTargets.has(sq)) return

    setActing(true)
    try {
      playSound('move')
      await postMove(bootstrap.code, bootstrap.myResumeToken, selected, sq)
      setSelected(null)
      await bootstrap.load()
    } catch {
      setSelected(null)
    } finally {
      setActing(false)
    }
  }

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
    // A match already in progress → newcomers can only watch (no late-player
    // seats), so present the join as a read-only viewer entry.
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
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : 'No account needed — enter a display name and play.'
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !activeSession) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    const detail = [activeSession.status_message, draughts10ResultDetail(activeSession.result_reason)]
      .filter(Boolean)
      .join(' · ')
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Final standings"
          detail={detail || undefined}
          leaderboard={
            activeSession.is_draw
              ? undefined
              : winnerLeaderboard(activeSession.winner_player_id, bootstrap.players, bootstrap.myPlayerId)
          }
          winnerPlayerId={activeSession.winner_player_id}
          roundKey={activeSession.id}
          hideDefaultHeader
          notice={
            <Draughts10ShareCard
              gameTitle={bootstrap.game.title}
              gameLabel={label}
              winnerName={winner ? winner.name : null}
              isDraw={activeSession.is_draw}
              reasonSubtitle={draughts10ResultDetail(activeSession.result_reason)}
              session={activeSession}
              players={bootstrap.players}
              highlightPlayerId={bootstrap.myPlayerId}
            />
          }
        />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const redPlayer = bootstrap.players.find((p) => p.id === activeSession.player_red_id)
  const blackPlayer = bootstrap.players.find((p) => p.id === activeSession.player_black_id)
  const redName = redPlayer?.name ?? 'Red'
  const blackName = blackPlayer?.name ?? 'Black'
  const timerSeconds = bootstrap.game?.timer_seconds ?? 0
  const mustJump = isMyTurn && !!activeSession.must_continue_from
  void clockTick

  return (
    <GameShell bootstrap={bootstrap} title={label} subtitle={`Code ${bootstrap.code}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner
          text={
            mustJump
              ? 'Keep jumping! — same piece must continue'
              : selected
                ? `Selected ${selected} — tap destination`
                : isMyTurn
                  ? `Your turn — tap a ${word}`
                  : `${turnPlayer?.name ?? 'Opponent'}'s turn`
          }
          isMyTurn={isMyTurn}
        />

        {!timed ? (
          <View style={styles.matchup}>
            <Text style={styles.matchupSide} numberOfLines={1}>
              🔴 {redName}
            </Text>
            <Text style={styles.matchupVs}>vs</Text>
            <Text style={[styles.matchupSide, styles.matchupSideRight]} numberOfLines={1}>
              ⚫ {blackName}
            </Text>
          </View>
        ) : null}

        {timed ? (
          <>
            <View style={styles.clocks}>
              <ClockChip
                label={`🔴 ${redPlayer?.name ?? 'Red'}`}
                ms={liveDraughts10ClockMs(activeSession, 'r')}
                active={activeSession.current_turn === 'r'}
              />
              <ClockChip
                label={`⚫ ${blackPlayer?.name ?? 'Black'}`}
                ms={liveDraughts10ClockMs(activeSession, 'b')}
                active={activeSession.current_turn === 'b'}
              />
            </View>
            {timerSeconds ? (
              <Text style={styles.clockHint}>
                ⏱ {Math.round(timerSeconds / 60)} min each — your clock only counts down on your turn
              </Text>
            ) : null}
          </>
        ) : null}

        <Draughts10Board
          board={activeSession.board}
          variant={variant}
          myColor={myColor}
          isMyTurn={isMyTurn && !isViewer}
          mustContinue={activeSession.must_continue_from}
          mustContinueRemaining={activeSession.must_continue_remaining}
          allowSkip={allowSkip}
          huffableSquares={huffableSquares}
          selected={selected}
          lastMoveFrom={activeSession.last_move_from}
          lastMoveTo={activeSession.last_move_to}
          acting={acting}
          redName={redName}
          blackName={blackName}
          nameColor={theme.text}
          mutedColor={theme.textMuted}
          onSquarePress={(row, col) => void onSquarePress(row, col)}
        />

        {myColor ? (
          <Text style={styles.identityHint}>
            You are <Text style={styles.identityStrong}>{myColor === 'r' ? '🔴 Red' : '⚫ Black'}</Text>
            {isMyTurn
              ? mustJump
                ? ' · you must keep jumping with the same piece'
                : ` · tap a ${word}, then its destination`
              : ' · waiting for your opponent'}
          </Text>
        ) : null}

        {isMyTurn && huffableSquares.length > 0 ? (
          <Text style={styles.huffHint}>
            Your opponent passed up a capture — tap a glowing {word} to huff it, or move as usual.
          </Text>
        ) : null}

        {myColor && !isViewer ? (
          <Pressable style={styles.resignBtn} disabled={acting} onPress={resign}>
            <Text style={styles.resignText}>Resign</Text>
          </Pressable>
        ) : null}

        <ConfirmDialog
          visible={resignOpen}
          title="Resign this game?"
          message="Your opponent will be awarded the win."
          confirmLabel="Resign"
          destructive
          confirming={acting}
          onConfirm={confirmResign}
          onCancel={() => setResignOpen(false)}
        />
      </ScrollView>
    </GameShell>
  )
}

function ClockChip({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  const styles = useThemedStyles(makeStyles)
  const lowTime = ms <= 30000
  return (
    <View style={[styles.clockChip, active && (lowTime ? styles.clockLow : styles.clockActive)]}>
      <Text style={styles.clockLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.clockValue, active && lowTime && styles.clockValueLow]}>{formatDraughts10Clock(ms)}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    clocks: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    clockChip: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: theme.surface,
    },
    clockActive: { borderColor: theme.primary },
    clockLow: { borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.12)' },
    clockLabel: { flexShrink: 1, color: theme.textMuted, fontWeight: '600' },
    clockValue: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
    clockValueLow: { color: '#fca5a5' },
    clockHint: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: -4, marginBottom: 8 },
    matchup: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: theme.surface,
      marginBottom: 8,
    },
    matchupSide: { flex: 1, color: theme.text, fontWeight: '700', fontSize: 13 },
    matchupSideRight: { textAlign: 'right' },
    matchupVs: { color: theme.textFaint, fontSize: 12, fontWeight: '600' },
    identityHint: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 10 },
    huffHint: { color: '#fca5a5', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 6 },
    identityStrong: { color: theme.text, fontWeight: '800' },
    resignBtn: {
      alignSelf: 'center',
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#3f1515',
    },
    resignText: { color: '#fca5a5', fontWeight: '700' },
  })
