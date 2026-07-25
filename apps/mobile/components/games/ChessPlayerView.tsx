import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Chess, type Square } from 'chess.js'
import type { ChessColor, ChessSession, Game, Player } from '@fateround/shared'
import {
  chessIsTimed,
  chessResultDetail,
  colorForPlayer,
  currentTurnPlayerId,
  formatChessClock,
  liveChessClockMs,
} from '@fateround/shared/chess'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postChessExpireTurn, postChessMove, postChessResign } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { CHESS_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { useToast } from '@/components/ui/Toast'
import { winnerLeaderboard } from '@/lib/finish-leaderboards'
import { useChessAppearance, type ChessPieceType } from './chess/chess-appearance'
import { ChessPieceGlyph } from './chess/ChessPieceGlyph'
import { ChessAppearanceIconButton, ChessAppearancePanel } from './chess/ChessAppearancePicker'
import {
  ChessCapturedSummary,
  ChessMoveBanner,
  ChessPlayerCard,
  computeMaterial,
  KingGlyph,
} from './chess/ChessCapturedTray'
import { ChessResultsExtras } from './chess/ChessResultsExtras'
import { ChessShareCard } from './chess/ChessShareCard'
import { type Premove, premoveNeedsPromotion, premoveTargets, type PremovePiece } from './chess/chess-premove'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'
type Promotion = 'q' | 'r' | 'b' | 'n'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const
const PIECE_NAMES: Record<ChessPieceType, string> = {
  p: 'Pawn',
  r: 'Rook',
  n: 'Knight',
  b: 'Bishop',
  q: 'Queen',
  k: 'King',
}
const PROMOTION_OPTIONS: { piece: Promotion; label: string }[] = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
]

export function ChessPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const { show } = useToast()
  const [session, setSession] = useState<ChessSession | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string; isPremove?: boolean } | null>(null)
  const [premove, setPremove] = useState<Premove | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [resignOpen, setResignOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: ChessSession | null; ok: boolean }> => {
      const res = await getSupabase()
        .from('chess_sessions')
        .select(CHESS_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle()
      const data = (res.data as ChessSession | null) ?? null
      if (data) setSession(data)
      return { state: data, ok: !res.error }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null, sessionData: ChessSession | null): Screen => {
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
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, ChessSession | null>({
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
    ['players', { table: 'games', column: 'id' }, 'chess_sessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  // A late-joiner / flagged spectator watches read-only (they hold no seat, so
  // colorForPlayer is null anyway — this also silences turn/move affordances).
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const myColor = bootstrap.myPlayerId && activeSession ? colorForPlayer(activeSession, bootstrap.myPlayerId) : null
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId && !isViewer
  const flipped = myColor === 'b'
  // Off-turn interactivity: queue a premove while the opponent is thinking.
  const canPremove = !isMyTurn && !!myColor && activeSession?.status === 'active'

  const appearanceDefaults = useMemo(
    () => ({ boardTheme: bootstrap.game?.chess_board_theme, pieceSet: bootstrap.game?.chess_piece_set }),
    [bootstrap.game?.chess_board_theme, bootstrap.game?.chess_piece_set]
  )
  const { boardTheme, pieceSet } = useChessAppearance(appearanceDefaults)

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'active',
    // The opening player's first move is a waiting->active transition, not a turn
    // change — without this they'd see "Game started!" instead of "Your turn!".
    startMessage: isMyTurn ? 'Your turn!' : 'Game started! 🎮',
  })

  const chess = useMemo(() => {
    if (!activeSession?.fen) return null
    try {
      return new Chess(activeSession.fen)
    } catch {
      return null
    }
  }, [activeSession?.fen])

  const legalTargets = useMemo(() => {
    const map = new Map<string, { promotion: boolean }>()
    if (!chess || !selected) return map
    if (isMyTurn) {
      try {
        for (const m of chess.moves({ square: selected as Square, verbose: true })) {
          const prev = map.get(m.to)
          map.set(m.to, { promotion: (prev?.promotion ?? false) || m.flags.includes('p') })
        }
      } catch {
        // invalid square — ignore
      }
    } else if (canPremove && myColor) {
      const piece = chess.get(selected as Square)
      if (piece && piece.color === myColor) {
        for (const to of premoveTargets(selected, piece.type as PremovePiece, myColor)) {
          // Keep taps on our own pieces meaning "reselect", not "premove onto it".
          if (chess.get(to as Square)?.color === myColor) continue
          map.set(to, { promotion: premoveNeedsPromotion(to, piece.type as PremovePiece, myColor) })
        }
      }
    }
    return map
  }, [chess, selected, isMyTurn, canPremove, myColor])

  const inCheckSquare = useMemo(() => {
    if (!chess || !activeSession?.in_check) return null
    const turn = activeSession.current_turn
    for (const file of FILES) {
      for (const rank of RANKS) {
        const square = `${file}${rank}`
        const piece = chess.get(square as Square)
        if (piece?.type === 'k' && piece.color === turn) return square
      }
    }
    return null
  }, [chess, activeSession?.in_check, activeSession?.current_turn])

  const material = useMemo(
    () => (chess ? computeMaterial(chess) : { capturedByWhite: [], capturedByBlack: [] }),
    [chess]
  )

  const timed = activeSession ? chessIsTimed(activeSession) : false

  useEffect(() => {
    if (!timed || activeSession?.status !== 'active') return
    const id = setInterval(() => setClockTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [timed, activeSession?.status, activeSession?.turn_started_at, activeSession?.current_turn])

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active' || !timed) return
    const ms = liveChessClockMs(activeSession, activeSession.current_turn)
    if (ms > 0) return
    void postChessExpireTurn(bootstrap.code)
      .then(() => bootstrap.load())
      .catch(() => {})
  }, [activeSession, timed, clockTick, bootstrap.code, bootstrap.load])

  const submitMove = useCallback(
    async (from: string, to: string, promotion?: Promotion) => {
      if (!bootstrap.myResumeToken || acting) return
      setActing(true)
      try {
        playSound('move')
        await postChessMove(bootstrap.code, bootstrap.myResumeToken, from, to, promotion)
        setSelected(null)
        setPromotionMove(null)
        await bootstrap.load()
      } catch {
        setSelected(null)
        setPromotionMove(null)
      } finally {
        setActing(false)
      }
    },
    [bootstrap.myResumeToken, bootstrap.code, bootstrap.load, acting]
  )

  // Fire the queued premove as soon as it's our turn. Re-validate against the
  // position the opponent left us — if the queued move is no longer legal
  // (piece captured, king now in check, path blocked) it's silently dropped.
  const firedPremove = useRef<Premove | null>(null)
  // The session's updated_at when the premove was queued. A strictly newer row
  // means a genuine turn advance (the opponent actually moved); an equal one
  // means nothing real happened (e.g. our own move failed + rolled back).
  const premoveAt = useRef<string | null>(null)
  useEffect(() => {
    if (!premove) return
    if (activeSession?.status === 'finished' || !myColor) {
      setPremove(null)
      return
    }
    if (!isMyTurn || acting || !chess || !activeSession) return
    if (premoveAt.current && Date.parse(activeSession.updated_at) <= Date.parse(premoveAt.current)) {
      setPremove(null)
      return
    }
    if (firedPremove.current === premove) return // guard double-run before state settles
    firedPremove.current = premove
    const legal = (() => {
      try {
        return chess
          .moves({ square: premove.from as Square, verbose: true })
          .some((m) => m.to === premove.to && (m.promotion ?? undefined) === premove.promotion)
      } catch {
        return false
      }
    })()
    setPremove(null)
    if (legal) void submitMove(premove.from, premove.to, premove.promotion)
  }, [premove, isMyTurn, acting, chess, myColor, activeSession, submitMove])

  const onSquarePress = (square: string) => {
    if (!chess || !myColor || (!isMyTurn && !canPremove)) return
    const piece = chess.get(square as Square)
    const pieceColor = piece?.color ?? null

    // Any tap while a premove is queued cancels it; the tap still falls through,
    // so tapping one of your pieces starts lining up a fresh one.
    if (premove) setPremove(null)

    if (selected === square) {
      setSelected(null)
      return
    }

    const target = selected ? legalTargets.get(square) : undefined
    if (selected && target) {
      if (isMyTurn) {
        if (target.promotion) setPromotionMove({ from: selected, to: square })
        else void submitMove(selected, square)
      } else {
        // Queue a premove for when it becomes our turn.
        if (target.promotion) {
          setPromotionMove({ from: selected, to: square, isPremove: true })
        } else if (activeSession) {
          premoveAt.current = activeSession.updated_at
          setPremove({ from: selected, to: square })
          setSelected(null)
          show('Premove saved — it plays automatically once it’s your turn')
        }
      }
      return
    }

    if (pieceColor === myColor) setSelected(square)
    else setSelected(null)
  }

  const confirmPromotion = (piece: Promotion) => {
    if (!promotionMove) return
    if (promotionMove.isPremove) {
      if (activeSession) premoveAt.current = activeSession.updated_at
      setPremove({ from: promotionMove.from, to: promotionMove.to, promotion: piece })
      setPromotionMove(null)
      setSelected(null)
      show('Premove saved — it plays automatically once it’s your turn')
    } else {
      void submitMove(promotionMove.from, promotionMove.to, piece)
    }
  }

  const resign = () => {
    if (!bootstrap.myResumeToken) return
    setResignOpen(true)
  }

  const confirmResign = () => {
    if (!bootstrap.myResumeToken) return
    void (async () => {
      setActing(true)
      try {
        await postChessResign(bootstrap.code, bootstrap.myResumeToken!)
        setResignOpen(false)
        await bootstrap.load()
      } finally {
        setActing(false)
      }
    })()
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
    // A match already in progress → the newcomer can only watch (chess has no
    // late-player seats), so present the join as a read-only viewer entry.
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
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !activeSession || !chess) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const detail = [activeSession.status_message, chessResultDetail(activeSession.result_reason)]
      .filter(Boolean)
      .join(' · ')
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title="Chess" subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          hideDefaultHeader
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
          notice={
            <ChessShareCard
              gameTitle={bootstrap.game.title}
              winnerName={winner ? winner.name : null}
              isDraw={activeSession.is_draw}
              reasonSubtitle={chessResultDetail(activeSession.result_reason)}
              game={bootstrap.game}
              players={bootstrap.players}
              session={activeSession}
              highlightPlayerId={bootstrap.myPlayerId}
            />
          }
        />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const displayRanks = flipped ? [...RANKS].reverse() : RANKS
  const displayFiles = flipped ? [...FILES].reverse() : FILES
  void clockTick

  const white = bootstrap.players.find((p) => p.id === activeSession.player_white_id)
  const black = bootstrap.players.find((p) => p.id === activeSession.player_black_id)
  // The two identity cards: your own seat leads (left), the opponent trails (right) —
  // falling back to White-then-Black for a spectator with no seat of their own.
  const cardOrder: ChessColor[] = myColor === 'b' ? ['b', 'w'] : ['w', 'b']
  const playerCardFor = (color: ChessColor) => ({
    name: (color === 'w' ? white : black)?.name ?? (color === 'w' ? 'White' : 'Black'),
    color,
    active: activeSession.status === 'active' && activeSession.current_turn === color,
  })
  const capturedSummaryEntries = cardOrder.map((color) => ({
    name: (color === 'w' ? white : black)?.name ?? (color === 'w' ? 'White' : 'Black'),
    pieces: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
    glyphColor: (color === 'w' ? 'b' : 'w') as ChessColor,
  }))
  const timeControlSeconds = bootstrap.game?.timer_seconds ?? 0

  return (
    <GameShell bootstrap={bootstrap} title="Chess" subtitle={`Code ${bootstrap.code}`}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ChessMoveBanner
          kicker={
            activeSession.in_check && isMyTurn
              ? 'Check'
              : isMyTurn
                ? 'Your move'
                : premove
                  ? 'Premove queued'
                  : "Opponent's turn"
          }
          text={
            activeSession.in_check && isMyTurn
              ? 'Check! Your move'
              : selected
                ? `${PIECE_NAMES[(chess?.get(selected as Square)?.type ?? 'p') as ChessPieceType]} selected — tap a dot to move`
                : isMyTurn
                  ? 'Your turn'
                  : premove
                    ? `Premove ${premove.from}→${premove.to} queued — tap the board to cancel`
                    : canPremove
                      ? `${turnPlayer?.name ?? 'Opponent'}'s turn — tap a piece to queue a premove`
                      : `${turnPlayer?.name ?? 'Opponent'}'s turn`
          }
        />

        <View style={styles.playerCards}>
          {cardOrder.map((color) => (
            <ChessPlayerCard
              key={color}
              {...playerCardFor(color)}
              clock={
                timed ? (
                  <ClockChip
                    ms={liveChessClockMs(activeSession, color)}
                    active={activeSession.current_turn === color}
                  />
                ) : undefined
              }
            />
          ))}
        </View>

        <ChessCapturedSummary entries={capturedSummaryEntries} set={pieceSet} />

        <View style={styles.board}>
          {displayRanks.map((rank, rankIdx) => (
            <View key={rank} style={styles.row}>
              {displayFiles.map((file, fileIdx) => {
                const square = `${file}${rank}`
                const isLight = (file.charCodeAt(0) - 97 + rank) % 2 === 0
                const piece = chess.get(square as Square)
                const isSelected = selected === square
                const isTarget = legalTargets.has(square)
                const isLastMove = activeSession.last_move_from === square || activeSession.last_move_to === square
                const isKingInCheck = square === inCheckSquare
                const isPremove = premove?.from === square || premove?.to === square
                // Coordinates hug the board edges (chess.com style): ranks down the
                // left column, files along the bottom row, tinted the opposite
                // square colour so each label reads against its own square.
                const showRank = fileIdx === 0
                const showFile = rankIdx === displayRanks.length - 1
                const coordColor = isLight ? boardTheme.dark : boardTheme.light
                return (
                  <Pressable
                    key={square}
                    style={[styles.square, { backgroundColor: isLight ? boardTheme.light : boardTheme.dark }]}
                    disabled={acting || (!isMyTurn && !canPremove)}
                    onPress={() => onSquarePress(square)}
                  >
                    {isLastMove ? <View style={[styles.overlay, styles.lastMoveOverlay]} /> : null}
                    {isKingInCheck ? <View style={[styles.overlay, styles.checkOverlay]} /> : null}
                    {isPremove ? <View style={[styles.overlay, styles.premoveOverlay]} /> : null}
                    {isSelected ? <View style={[styles.overlay, styles.selectedOverlay]} /> : null}
                    {showRank ? <Text style={[styles.coordRank, { color: coordColor }]}>{rank}</Text> : null}
                    {showFile ? <Text style={[styles.coordFile, { color: coordColor }]}>{file}</Text> : null}
                    {piece ? (
                      <ChessPieceGlyph
                        set={pieceSet}
                        color={piece.color}
                        type={piece.type as ChessPieceType}
                        size={36}
                      />
                    ) : null}
                    {isTarget ? piece ? <View style={styles.captureRing} /> : <View style={styles.moveDot} /> : null}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>

        {timed && timeControlSeconds > 0 ? (
          <Text style={styles.timeNote}>
            ⏱ {Math.round(timeControlSeconds / 60)} min each — your clock only counts down on your turn
          </Text>
        ) : null}

        {myColor && activeSession.status === 'active' ? (
          <Text style={styles.identity}>
            You are <KingGlyph color={myColor} size={13} />{' '}
            <Text style={styles.identityStrong}>{myColor === 'w' ? 'White' : 'Black'}</Text>
            {isMyTurn
              ? ' · tap a piece, then its destination'
              : premove
                ? ` · premove ${premove.from}→${premove.to} queued — tap the board to cancel`
                : canPremove
                  ? ' · waiting for your opponent — tap a piece to queue a premove'
                  : ' · waiting for your opponent'}
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          <ChessAppearanceIconButton open={appearanceOpen} onToggle={() => setAppearanceOpen((v) => !v)} />
          {myColor ? (
            <Pressable style={styles.resignBtn} disabled={acting} onPress={resign}>
              <Text style={styles.resignIcon}>🏳️</Text>
              <Text style={styles.resignText}>Resign</Text>
            </Pressable>
          ) : null}
        </View>
        {appearanceOpen ? <ChessAppearancePanel defaults={appearanceDefaults} /> : null}
      </ScrollView>

      <Modal visible={!!promotionMove} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {promotionMove?.isPremove ? 'Premove — promote pawn to' : 'Promote pawn to'}
            </Text>
            {PROMOTION_OPTIONS.map(({ piece, label }) => (
              <Pressable key={piece} style={styles.promoBtn} onPress={() => confirmPromotion(piece)}>
                <Text style={styles.promoBtnText}>{label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.promoCancel} onPress={() => setPromotionMove(null)}>
              <Text style={styles.promoCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={resignOpen}
        title="Resign?"
        message="Your opponent will win."
        confirmLabel="Resign"
        destructive
        confirming={acting}
        onConfirm={confirmResign}
        onCancel={() => setResignOpen(false)}
      />
    </GameShell>
  )
}

function ClockChip({ ms, active }: { ms: number; active: boolean }) {
  const styles = useThemedStyles(makeStyles)
  // Under 30s the active clock turns red and pulses — a quick visual "you're low".
  const lowTime = active && ms <= 30000
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!lowTime) {
      pulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [lowTime, pulse])

  return (
    <Animated.View
      style={[
        styles.clockChip,
        active && styles.clockActive,
        lowTime && styles.clockLow,
        lowTime ? { opacity: pulse } : null,
      ]}
    >
      <Text style={[styles.clockValue, active && styles.clockActiveText, lowTime && styles.clockLowText]}>
        {formatChessClock(ms)}
      </Text>
    </Animated.View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1, marginHorizontal: -16 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
    board: { alignSelf: 'center', borderWidth: 2, borderColor: theme.border, borderRadius: 8, overflow: 'hidden' },
    row: { flexDirection: 'row' },
    square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    lastMoveOverlay: { backgroundColor: 'rgba(250,204,21,0.4)' },
    checkOverlay: { backgroundColor: 'rgba(244,63,94,0.5)' },
    premoveOverlay: { backgroundColor: 'rgba(14,165,233,0.45)' },
    selectedOverlay: { borderWidth: 3, borderColor: theme.primary },
    moveDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)' },
    captureRing: {
      position: 'absolute',
      top: 3,
      left: 3,
      right: 3,
      bottom: 3,
      borderRadius: 20,
      borderWidth: 4,
      borderColor: 'rgba(0,0,0,0.3)',
    },
    playerCards: { flexDirection: 'row', gap: 8 },
    clockChip: { paddingHorizontal: 2 },
    clockActive: {},
    clockActiveText: { color: theme.primary },
    clockLow: { backgroundColor: 'rgba(244,63,94,0.18)', borderRadius: 6, paddingVertical: 2 },
    clockLowText: { color: '#fb7185' },
    clockValue: { color: theme.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'], flexShrink: 0 },
    timeNote: { color: theme.textFaint, fontSize: 11, textAlign: 'center', marginTop: -6 },
    coordRank: { position: 'absolute', top: 1, left: 2, fontSize: 8, fontWeight: '700' },
    coordFile: { position: 'absolute', bottom: 1, right: 2, fontSize: 8, fontWeight: '700' },
    identity: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 10 },
    identityStrong: { color: theme.text, fontWeight: '700' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    resignBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    resignIcon: { fontSize: 16 },
    resignText: { color: theme.text, fontWeight: '700' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalCard: { backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 8 },
    modalTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
    promoBtn: { padding: 12, borderRadius: 8, backgroundColor: theme.border },
    promoBtnText: { color: theme.text, fontWeight: '700', textAlign: 'center' },
    promoCancel: { padding: 8 },
    promoCancelText: { color: theme.textMuted, textAlign: 'center' },
  })
