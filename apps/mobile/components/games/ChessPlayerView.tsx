import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Chess, type Square } from 'chess.js'
import type { ChessSession, Game, Player } from '@fateround/shared'
import {
  chessIsTimed,
  chessResultDetail,
  colorForPlayer,
  currentTurnPlayerId,
  formatChessClock,
  liveChessClockMs,
} from '@fateround/shared/chess'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
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
import { winnerLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'
type Promotion = 'q' | 'r' | 'b' | 'n'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const
const PROMOTION_OPTIONS: { piece: Promotion; label: string }[] = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
]

const WHITE_GLYPHS: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }
const BLACK_GLYPHS: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

export function ChessPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<ChessSession | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [resignOpen, setResignOpen] = useState(false)

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

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, sessionData: ChessSession | null): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (game.status === 'finished' || sessionData?.status === 'finished') return 'finished'
      return 'waiting'
    },
    []
  )

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
  const myColor = bootstrap.myPlayerId && activeSession ? colorForPlayer(activeSession, bootstrap.myPlayerId) : null
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = bootstrap.myPlayerId != null && turnPlayerId === bootstrap.myPlayerId
  const flipped = myColor === 'b'

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'active',
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
    if (!chess || !selected || !isMyTurn) return new Set<string>()
    try {
      const moves = chess.moves({ square: selected as Square, verbose: true })
      return new Set(moves.map((m) => m.to))
    } catch {
      return new Set<string>()
    }
  }, [chess, selected, isMyTurn])

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
    void postChessExpireTurn(bootstrap.code).then(() => bootstrap.load()).catch(() => {})
  }, [activeSession, timed, clockTick, bootstrap.code, bootstrap.load])

  const submitMove = async (from: string, to: string, promotion?: Promotion) => {
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
  }

  const onSquarePress = (square: string) => {
    if (!chess || !isMyTurn || acting || !myColor) return
    const piece = chess.get(square as Square)
    const pieceColor = piece?.color ?? null

    if (selected === square) {
      setSelected(null)
      return
    }

    if (selected && legalTargets.has(square)) {
      const movingPiece = chess.get(selected as Square)
      const rank = square[1]
      const needsPromotion =
        movingPiece?.type === 'p' && ((myColor === 'w' && rank === '8') || (myColor === 'b' && rank === '1'))
      if (needsPromotion) {
        setPromotionMove({ from: selected, to: square })
        return
      }
      void submitMove(selected, square)
      return
    }

    if (pieceColor === myColor) setSelected(square)
    else setSelected(null)
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
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !activeSession || !chess) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const detail = [
      activeSession.status_message,
      chessResultDetail(activeSession.result_reason),
    ]
      .filter(Boolean)
      .join(' · ')
    const title = activeSession.is_draw ? 'Draw!' : winner ? `${winner.name} wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title="Chess" subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={title} subtitle="Final standings" detail={detail || undefined} leaderboard={activeSession.is_draw ? undefined : winnerLeaderboard(activeSession.winner_player_id, bootstrap.players, bootstrap.myPlayerId)} winnerPlayerId={activeSession.winner_player_id} roundKey={activeSession.id} />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const displayRanks = flipped ? [...RANKS].reverse() : RANKS
  const displayFiles = flipped ? [...FILES].reverse() : FILES
  void clockTick

  return (
    <GameShell bootstrap={bootstrap} title="Chess" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={
          activeSession.in_check && isMyTurn
            ? 'Check! Your move'
            : selected
              ? `Selected ${selected} — tap destination`
              : isMyTurn
                ? 'Your turn'
                : `${turnPlayer?.name ?? 'Opponent'}'s turn`
        }
        isMyTurn={isMyTurn}
      />

      {timed ? (
        <View style={styles.clocks}>
          <ClockChip
            label="White"
            ms={liveChessClockMs(activeSession, 'w')}
            active={activeSession.current_turn === 'w'}
          />
          <ClockChip
            label="Black"
            ms={liveChessClockMs(activeSession, 'b')}
            active={activeSession.current_turn === 'b'}
          />
        </View>
      ) : null}

      <View style={styles.board}>
        {displayRanks.map((rank) => (
          <View key={rank} style={styles.row}>
            {displayFiles.map((file) => {
              const square = `${file}${rank}`
              const dark = (file.charCodeAt(0) - 97 + rank) % 2 === 0
              const piece = chess.get(square as Square)
              const isSelected = selected === square
              const isTarget = legalTargets.has(square)
              const isLastFrom = activeSession.last_move_from === square
              const isLastTo = activeSession.last_move_to === square
              const isKingInCheck = square === inCheckSquare
              const glyph = piece
                ? piece.color === 'w'
                  ? WHITE_GLYPHS[piece.type]
                  : BLACK_GLYPHS[piece.type]
                : null
              return (
                <Pressable
                  key={square}
                  style={[
                    styles.square,
                    dark ? styles.darkSquare : styles.lightSquare,
                    isSelected && styles.selectedSquare,
                    isTarget && styles.targetSquare,
                    (isLastFrom || isLastTo) && styles.lastMoveSquare,
                    isKingInCheck && styles.checkSquare,
                  ]}
                  disabled={acting || !isMyTurn}
                  onPress={() => onSquarePress(square)}
                >
                  {glyph ? (
                    <Text style={[styles.piece, piece!.color === 'w' ? styles.whitePiece : styles.blackPiece]}>
                      {glyph}
                    </Text>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {isMyTurn ? (
        <Pressable style={styles.resignBtn} disabled={acting} onPress={resign}>
          <Text style={styles.resignText}>Resign</Text>
        </Pressable>
      ) : null}

      <Modal visible={!!promotionMove} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Promote pawn to</Text>
            {PROMOTION_OPTIONS.map(({ piece, label }) => (
              <Pressable
                key={piece}
                style={styles.promoBtn}
                onPress={() => promotionMove && void submitMove(promotionMove.from, promotionMove.to, piece)}
              >
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

function ClockChip({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.clockChip, active && styles.clockActive]}>
      <Text style={styles.clockLabel}>{label}</Text>
      <Text style={styles.clockValue}>{formatChessClock(ms)}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  board: { alignSelf: 'center', borderWidth: 2, borderColor: theme.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  lightSquare: { backgroundColor: '#f0d9b5' },
  darkSquare: { backgroundColor: '#b58863' },
  selectedSquare: { borderWidth: 2, borderColor: '#f43f5e' },
  targetSquare: { backgroundColor: 'rgba(34,197,94,0.35)' },
  lastMoveSquare: { backgroundColor: 'rgba(250,204,21,0.35)' },
  checkSquare: { backgroundColor: 'rgba(220,38,38,0.45)' },
  piece: { fontSize: 28, fontWeight: '800' },
  whitePiece: { color: '#fafafa' },
  blackPiece: { color: '#171717' },
  clocks: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  clockChip: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e1e28',
  },
  clockActive: { borderWidth: 1, borderColor: '#f43f5e' },
  clockLabel: { color: '#a1a1aa', fontWeight: '600' },
  clockValue: { color: '#fafafa', fontWeight: '800', fontVariant: ['tabular-nums'] },
  resignBtn: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3f1515',
  },
  resignText: { color: '#fca5a5', fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1e1e28', borderRadius: 12, padding: 16, gap: 8 },
  modalTitle: { color: '#fafafa', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  promoBtn: { padding: 12, borderRadius: 8, backgroundColor: '#2a2a35' },
  promoBtnText: { color: '#fafafa', fontWeight: '700', textAlign: 'center' },
  promoCancel: { padding: 8 },
  promoCancelText: { color: '#a1a1aa', textAlign: 'center' },
})
