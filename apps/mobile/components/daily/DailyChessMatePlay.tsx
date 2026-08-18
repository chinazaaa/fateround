/**
 * Daily Chess Mate play surface (mobile).
 *
 * Port of `src/components/daily/DailyChessMatePlay.tsx`. Uses `chess.js`
 * (already a mobile dep via ChessPlayerView) for FEN parsing, legal move
 * generation, and SAN — much simpler than porting the hand-rolled parser
 * the web daily component ships. Uses the same ChessPieceGlyph / board
 * theme primitives the mobile multiplayer chess game uses so the daily
 * board matches the app's look.
 *
 * Same play flow as web: tap an attacker piece → tap a legal destination.
 * If the SAN matches any remaining solution line, the move sticks and the
 * defender's reply auto-plays. Wrong moves undo, flash red, and count as
 * a miss. When the attacker's move count hits `mateIn`, the puzzle solves
 * and auto-submits after a short reveal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Chess, type Square } from 'chess.js'
import { ChessPieceGlyph } from '@/components/games/chess/ChessPieceGlyph'
import {
  useChessAppearance,
  type ChessPieceType,
} from '@/components/games/chess/chess-appearance'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import {
  clearDailyProgress,
  getOrCreateStartedAt,
  loadDailyAnswers,
  saveDailyAnswers,
} from '@/lib/daily-progress'
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface SavedProgress {
  moves: string[]
  wrongAttempts: number
  status: 'playing' | 'solved'
}

const stripMarkers = (move: string) => move.replace(/[+#!?]/g, '')

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const

export function DailyChessMatePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { boardTheme, pieceSet } = useChessAppearance()

  const fen = puzzle.fen as string
  const mateIn = puzzle.mateIn as number
  const toMove = puzzle.toMove as 'white' | 'black'
  const solutionLines = useMemo(
    () => ((puzzle.solutionLines ?? []) as string[][]),
    [puzzle.solutionLines]
  )

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [moves, setMoves] = useState<string[]>([])
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [status, setStatus] = useState<'playing' | 'solved'>('playing')
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [wrongFlash, setWrongFlash] = useState(false)
  const [defenderPending, setDefenderPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<SavedProgress>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) {
        setMoves(saved.moves ?? [])
        setWrongAttempts(saved.wrongAttempts ?? 0)
        setStatus(saved.status ?? 'playing')
      }
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers<SavedProgress>(challengeId, { moves, wrongAttempts, status })
  }, [challengeId, hydrated, moves, status, submitted, wrongAttempts])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted && status === 'playing',
    startAtMs: startAtMs ?? undefined,
  })

  // Replay the solution moves so far to derive the current chess.js position.
  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(fen)
    } catch {
      /* leave starting position */
    }
    for (const m of moves) {
      try {
        c.move(m, { strict: false })
      } catch {
        break
      }
    }
    return c
  }, [fen, moves])

  const attackerMoveCount = useMemo(() => moves.filter((_, i) => i % 2 === 0).length, [moves])
  const isAttackerTurn = moves.length % 2 === 0 && !defenderPending

  const remainingLines = useMemo(
    () =>
      solutionLines.filter((line) => {
        for (let i = 0; i < moves.length && i < line.length; i++) {
          if (stripMarkers(moves[i]) !== stripMarkers(line[i])) return false
        }
        return true
      }),
    [solutionLines, moves]
  )

  const legalTargets = useMemo(() => {
    const set = new Set<Square>()
    if (!selectedSquare) return set
    try {
      for (const m of chess.moves({ square: selectedSquare, verbose: true })) {
        set.add(m.to as Square)
      }
    } catch {
      /* invalid square */
    }
    return set
  }, [chess, selectedSquare])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: {
        moves: moves.filter((_, i) => i % 2 === 0), // only attacker moves scored
        wrongAttempts,
      },
    })
  }, [challengeId, elapsed, maxSeconds, moves, onSubmit, wrongAttempts])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  useEffect(() => {
    if (status === 'solved' && !submitRef.current && !defenderPending) {
      const t = setTimeout(handleSubmit, 1200)
      return () => clearTimeout(t)
    }
  }, [defenderPending, handleSubmit, status])

  const onSquarePress = useCallback(
    (square: Square) => {
      if (submitted || status !== 'playing' || defenderPending || !isAttackerTurn) return
      const piece = chess.get(square)
      const attackerColor = toMove === 'white' ? 'w' : 'b'

      if (!selectedSquare) {
        if (piece && piece.color === attackerColor) setSelectedSquare(square)
        return
      }
      if (square === selectedSquare) {
        setSelectedSquare(null)
        return
      }
      // Tapping another own piece → reselect.
      if (piece && piece.color === attackerColor) {
        setSelectedSquare(square)
        return
      }

      // Attempt the move. chess.js validates legality; solution lines validate correctness.
      const attempt = new Chess(chess.fen())
      let result
      try {
        result = attempt.move({ from: selectedSquare, to: square, promotion: 'q' })
      } catch {
        result = null
      }
      if (!result) {
        setSelectedSquare(null)
        return
      }

      const san = result.san
      const moveIndex = moves.length
      const matching = remainingLines.filter(
        (line) => moveIndex < line.length && stripMarkers(line[moveIndex]) === stripMarkers(san)
      )

      if (matching.length === 0) {
        // Wrong move — flash and count.
        setSelectedSquare(null)
        setWrongAttempts((n) => n + 1)
        setWrongFlash(true)
        setTimeout(() => setWrongFlash(false), 700)
        return
      }

      // Correct — commit using the canonical solution notation (keeps +/# markers).
      const canonical = matching[0][moveIndex]
      const nextMoves = [...moves, canonical]
      setMoves(nextMoves)
      setSelectedSquare(null)

      // If that was the last attacker move → solved.
      if (attackerMoveCount + 1 >= mateIn) {
        setStatus('solved')
        return
      }
      // Otherwise auto-play the defender reply from the same line.
      const defenderMove = matching[0][moveIndex + 1]
      if (defenderMove) {
        setDefenderPending(true)
        setTimeout(() => {
          setMoves((prev) => [...prev, defenderMove])
          setDefenderPending(false)
        }, 700)
      }
    },
    [attackerMoveCount, chess, defenderPending, isAttackerTurn, mateIn, moves, remainingLines, selectedSquare, status, submitted, toMove]
  )

  const giveUp = () => {
    Alert.alert('Give up?', 'The leaderboard uses however many moves you found.', [
      { text: 'Keep trying', style: 'cancel' },
      { text: 'Give up', style: 'destructive', onPress: handleSubmit },
    ])
  }

  // Flip the board so the side-to-move plays from the bottom.
  const flipped = toMove === 'black'
  const displayRanks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : RANKS
  const displayFiles = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : FILES

  const timerColor = isTimeUp ? theme.error : theme.text

  let statusText: string
  let statusColor: string
  if (status === 'solved') {
    statusText =
      wrongAttempts === 0
        ? 'Checkmate! Perfect solve!'
        : `Checkmate! (${wrongAttempts} wrong ${wrongAttempts === 1 ? 'attempt' : 'attempts'})`
    statusColor = theme.success
  } else if (wrongFlash) {
    statusText = 'Not quite — try again'
    statusColor = theme.error
  } else if (defenderPending) {
    statusText = 'Correct! Opponent responds…'
    statusColor = theme.textMuted
  } else {
    statusText =
      wrongAttempts > 0
        ? `Your turn — find the mate! (${wrongAttempts} miss${wrongAttempts === 1 ? '' : 'es'})`
        : 'Your turn — find the mate!'
    statusColor = theme.textMuted
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          {toMove === 'white' ? 'White' : 'Black'} to move · Mate in {mateIn}
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Tap a piece, then tap its destination to move. Find the checkmate sequence.
      </Text>

      <View style={styles.boardWrap}>
        <View style={[styles.board, { borderColor: theme.border }]}>
          {displayRanks.map((rank, rankIdx) => (
            <View key={rank} style={styles.boardRow}>
              {displayFiles.map((file, fileIdx) => {
                const square = `${file}${rank}` as Square
                const piece = chess.get(square)
                const isLight = (file.charCodeAt(0) - 97 + rank) % 2 === 0
                const isSelected = selectedSquare === square
                const isTarget = legalTargets.has(square)
                const showRank = fileIdx === 0
                const showFile = rankIdx === displayRanks.length - 1
                const coordColor = isLight ? boardTheme.dark : boardTheme.light
                return (
                  <Pressable
                    key={square}
                    style={[
                      styles.square,
                      { backgroundColor: isLight ? boardTheme.light : boardTheme.dark },
                    ]}
                    disabled={submitted || status !== 'playing'}
                    onPress={() => onSquarePress(square)}
                  >
                    {isSelected ? <View style={[styles.overlay, styles.selectedOverlay]} /> : null}
                    {showRank ? <Text style={[styles.coordRank, { color: coordColor }]}>{rank}</Text> : null}
                    {showFile ? <Text style={[styles.coordFile, { color: coordColor }]}>{file}</Text> : null}
                    {piece ? (
                      <ChessPieceGlyph
                        set={pieceSet}
                        color={piece.color}
                        type={piece.type as ChessPieceType}
                        size={32}
                      />
                    ) : null}
                    {isTarget ? (
                      piece ? <View style={styles.captureRing} /> : <View style={styles.moveDot} />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.statusBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {moves.length > 0 ? (
        <View style={[styles.movesBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={styles.movesTitle}>Moves</Text>
          <View style={styles.movesRow}>
            {moves.map((m, i) => {
              const isAttacker = i % 2 === 0
              const moveNum = Math.floor(i / 2) + 1
              return (
                <Text
                  key={i}
                  style={[
                    styles.moveText,
                    { color: isAttacker ? theme.text : theme.textMuted, fontWeight: isAttacker ? '800' : '600' },
                  ]}
                >
                  {isAttacker ? `${moveNum}. ` : ''}
                  {m}
                </Text>
              )
            })}
          </View>
        </View>
      ) : null}

      {status === 'playing' && !submitted && moves.length > 0 ? (
        <AppButton
          label={`Give up and submit (${attackerMoveCount}/${mateIn} moves)`}
          tone="ghost"
          size="sm"
          fullWidth
          onPress={giveUp}
        />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    timerLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    boardWrap: { alignItems: 'center' },
    board: { borderWidth: 2, borderRadius: 6, overflow: 'hidden' },
    boardRow: { flexDirection: 'row' },
    square: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    selectedOverlay: { backgroundColor: 'rgba(30, 144, 255, 0.45)' },
    moveDot: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: 'rgba(30, 144, 255, 0.55)',
    },
    captureRing: {
      position: 'absolute',
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 3,
      borderColor: 'rgba(30, 144, 255, 0.55)',
    },
    coordRank: { position: 'absolute', top: 1, left: 2, fontSize: 8, fontWeight: '700' },
    coordFile: { position: 'absolute', bottom: 1, right: 2, fontSize: 8, fontWeight: '700' },
    statusBox: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    statusText: { fontSize: theme.type.body.size, fontWeight: '700' },
    movesBox: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
    movesTitle: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    movesRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
    moveText: { fontSize: theme.type.body.size },
  })
