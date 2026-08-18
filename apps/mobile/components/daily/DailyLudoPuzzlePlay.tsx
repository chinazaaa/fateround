/**
 * Daily Ludo Puzzle play surface (mobile).
 *
 * Port of `src/components/daily/DailyLudoPuzzlePlay.tsx`. Reuses the app's
 * existing multiplayer LudoBoard + LudoDie primitives so the daily surface
 * looks like the normal game. The daily puzzle model is simpler than
 * multiplayer (single fixed dice sequence, one green player, obstacle
 * "captures"), so we bridge to the LudoBoard API by:
 *
 *   - packaging the puzzle pieces into a single-color LudoPlayerState,
 *   - synthesising a LudoMoveOption[] for each legal move given the
 *     current roll (diceIndex 0, diceValue = roll),
 *   - handling `onMovePiece(pieceId, diceIndex)` by advancing our own
 *     puzzle state and dropping any captured obstacle.
 *
 * Auto-skips when no legal move exists for the roll, auto-submits on
 * running out of rolls, getting all tokens home, or on timeout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import type {
  LudoMoveOption,
  LudoPiece,
  LudoPlayerState,
  Player,
} from '@fateround/shared'
import { LudoBoard } from '@/components/games/ludo/LudoBoard'
import { LudoDie } from '@/components/games/ludo/LudoDice'
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

interface LudoPuzzlePiece {
  id: number
  zone: 'base' | 'track' | 'home' | 'finished'
  pos: number
}

interface LudoObstacle {
  trackPos: number
}

interface SavedState {
  pieces: LudoPuzzlePiece[]
  obstacles: LudoObstacle[]
  moves: Array<number | null>
  rollIndex: number
  captures: number
}

const HOME_ENTRY_STEPS = 51
const FINISH_STEPS = 56
const PUZZLE_PLAYER_ID = 'puzzle-player'
const PUZZLE_COLOR = 'green' as const

function stepsFromPiece(p: LudoPuzzlePiece): number {
  if (p.zone === 'base') return -1
  if (p.zone === 'track') return p.pos
  if (p.zone === 'home') return HOME_ENTRY_STEPS + p.pos
  return FINISH_STEPS
}

function pieceFromSteps(id: number, steps: number): LudoPuzzlePiece {
  if (steps < 0) return { id, zone: 'base', pos: 0 }
  if (steps < HOME_ENTRY_STEPS) return { id, zone: 'track', pos: steps }
  if (steps < FINISH_STEPS) return { id, zone: 'home', pos: steps - HOME_ENTRY_STEPS }
  return { id, zone: 'finished', pos: 0 }
}

function canMove(p: LudoPuzzlePiece, roll: number): boolean {
  const steps = stepsFromPiece(p)
  if (p.zone === 'finished') return false
  if (steps === -1) return roll === 6
  return steps + roll <= FINISH_STEPS
}

const anyLegalMove = (pieces: LudoPuzzlePiece[], roll: number) => pieces.some((p) => canMove(p, roll))
const allFinished = (pieces: LudoPuzzlePiece[]) => pieces.every((p) => p.zone === 'finished')

export function DailyLudoPuzzlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const startingPieces = useMemo(() => (puzzle.startingPieces ?? []) as LudoPuzzlePiece[], [puzzle.startingPieces])
  const diceSequence = useMemo(() => (puzzle.diceSequence ?? []) as number[], [puzzle.diceSequence])
  const obstacles0 = useMemo(() => (puzzle.obstacles ?? []) as LudoObstacle[], [puzzle.obstacles])
  const optimalRolls = (puzzle.optimalRolls ?? 0) as number

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [state, setState] = useState<SavedState>({
    pieces: startingPieces.map((p) => ({ ...p })),
    obstacles: obstacles0.map((o) => ({ ...o })),
    moves: [],
    rollIndex: 0,
    captures: 0,
  })
  const [skipMessage, setSkipMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<SavedState>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) setState(saved)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers<SavedState>(challengeId, state)
  }, [challengeId, hydrated, state, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { moves: state.moves },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, state.moves])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  useEffect(() => {
    if (allFinished(state.pieces) && state.moves.length > 0 && !submitRef.current) handleSubmit()
  }, [state.pieces, state.moves.length, handleSubmit])

  useEffect(() => {
    if (state.rollIndex >= diceSequence.length && !submitRef.current && state.moves.length > 0) handleSubmit()
  }, [state.rollIndex, diceSequence.length, state.moves.length, handleSubmit])

  // Auto-skip if the current roll has no legal move.
  useEffect(() => {
    if (submitted || !hydrated) return
    if (state.rollIndex >= diceSequence.length) return
    if (allFinished(state.pieces)) return
    const roll = diceSequence[state.rollIndex]
    if (!anyLegalMove(state.pieces, roll)) {
      setSkipMessage(`No legal move for ${roll} — skipping`)
      const id = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          moves: [...prev.moves, null],
          rollIndex: prev.rollIndex + 1,
        }))
        setSkipMessage(null)
      }, 700)
      return () => clearTimeout(id)
    }
  }, [state.rollIndex, state.pieces, diceSequence, submitted, hydrated])

  const handlePieceTap = useCallback(
    (pieceId: number) => {
      if (submitted) return
      if (state.rollIndex >= diceSequence.length) return
      const roll = diceSequence[state.rollIndex]
      const piece = state.pieces.find((p) => p.id === pieceId)
      if (!piece || !canMove(piece, roll)) return

      setState((prev) => {
        const steps = stepsFromPiece(piece)
        const newSteps = steps === -1 ? 0 : steps + roll
        const newPiece = pieceFromSteps(pieceId, newSteps)
        const newPieces = prev.pieces.map((p) => (p.id === pieceId ? newPiece : p))
        let newObstacles = prev.obstacles
        let captureGain = 0
        if (newPiece.zone === 'track' && prev.obstacles.some((o) => o.trackPos === newPiece.pos)) {
          newObstacles = prev.obstacles.filter((o) => o.trackPos !== newPiece.pos)
          captureGain = 1
        }
        return {
          ...prev,
          pieces: newPieces,
          obstacles: newObstacles,
          moves: [...prev.moves, pieceId],
          rollIndex: prev.rollIndex + 1,
          captures: prev.captures + captureGain,
        }
      })
    },
    [submitted, state.rollIndex, state.pieces, diceSequence]
  )

  const currentRoll = state.rollIndex < diceSequence.length ? diceSequence[state.rollIndex] : null

  // Bridge to the mobile LudoBoard: single-color player state + synthesised move options for
  // the current roll (diceIndex 0 — this puzzle only ever consumes one die per move).
  const ludoStates: LudoPlayerState[] = useMemo(
    () => [
      {
        id: 'state-1',
        game_id: 'puzzle',
        player_id: PUZZLE_PLAYER_ID,
        color: PUZZLE_COLOR,
        pieces: state.pieces as LudoPiece[],
        player_order: 0,
      },
    ],
    [state.pieces]
  )

  const stubPlayers: Player[] = useMemo(
    () => [
      {
        id: PUZZLE_PLAYER_ID,
        name: 'You',
        game_id: 'puzzle',
        gender: 'both',
        joined_at: '',
      },
    ],
    []
  )

  const legalMoves: LudoMoveOption[] = useMemo(() => {
    if (currentRoll === null || submitted || skipMessage) return []
    return state.pieces
      .filter((p) => canMove(p, currentRoll))
      .map((p) => {
        const steps = stepsFromPiece(p)
        const newSteps = steps === -1 ? 0 : steps + currentRoll
        const to = pieceFromSteps(p.id, newSteps)
        return {
          pieceId: p.id,
          from: p as LudoPiece,
          to: to as LudoPiece,
          captures: to.zone === 'track' && state.obstacles.some((o) => o.trackPos === to.pos),
          diceIndex: 0,
          diceValue: currentRoll,
        }
      })
  }, [state.pieces, state.obstacles, currentRoll, submitted, skipMessage])

  const giveUp = () => {
    Alert.alert('Submit early?', 'The leaderboard uses however many tokens you got home.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Submit', style: 'destructive', onPress: handleSubmit },
    ])
  }

  const tokensHome = state.pieces.filter((p) => p.zone === 'finished').length
  const timerColor = elapsed >= maxSeconds - 10 ? theme.error : theme.text

  return (
    <View style={styles.wrap}>
      <View style={[styles.headerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.headerText}>
          Roll {Math.min(state.rollIndex + 1, diceSequence.length)}/{diceSequence.length}
        </Text>
        <Text style={styles.headerText}>{tokensHome}/4 home</Text>
        <Text style={[styles.headerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <View style={[styles.diceCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {currentRoll !== null ? (
          <View style={styles.diceRow}>
            <LudoDie value={currentRoll} />
            <View style={{ flex: 1 }}>
              <Text style={styles.diceTitle}>Move {currentRoll}</Text>
              <Text style={styles.diceSub}>
                {legalMoves.length > 0 ? 'Tap a highlighted piece to move it.' : 'No moves available — skipping…'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.diceTitle}>No more rolls</Text>
        )}
        {skipMessage ? <Text style={styles.skipMessage}>{skipMessage}</Text> : null}
      </View>

      {state.rollIndex === 0 ? (
        <View style={[styles.howto, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.howtoTitle}>How to play</Text>
          <Text style={styles.howtoBody}>
            Get all 4 green tokens around the board and into the home lane. Roll 6 to leave base. Tap a highlighted piece
            to move it.
            {state.obstacles.length > 0 ? ' Land on red obstacles to capture them (+50 pts).' : ''} Fewer rolls = higher
            score. Par: {optimalRolls} rolls.
          </Text>
        </View>
      ) : null}

      <LudoBoard
        states={ludoStates}
        players={stubPlayers}
        legalMoves={legalMoves}
        myPlayerId={PUZZLE_PLAYER_ID}
        isMyTurn={!submitted && currentRoll !== null && !skipMessage}
        acting={false}
        onMovePiece={(pieceId) => handlePieceTap(pieceId)}
      />

      {state.captures > 0 ? (
        <Text style={styles.captureNote}>
          Obstacles captured: {state.captures} (+{state.captures * 50} pts)
        </Text>
      ) : null}

      {state.moves.length > 0 && !submitted && !allFinished(state.pieces) ? (
        <AppButton
          label={`Submit early (${state.moves.length} rolls used)`}
          tone="ghost"
          size="sm"
          fullWidth
          onPress={giveUp}
        />
      ) : null}

      {allFinished(state.pieces) && !submitted ? (
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>All tokens home!</Text>
          <Text style={styles.doneBody}>Submitting…</Text>
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm, padding: theme.space.md },
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    headerText: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', fontVariant: ['tabular-nums'] },
    headerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    diceCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
    diceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    diceTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    diceSub: { color: theme.textMuted, fontSize: theme.type.caption.size, marginTop: 2 },
    skipMessage: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
    howto: { padding: 12, borderRadius: 12, borderWidth: 1 },
    howtoTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', marginBottom: 4 },
    howtoBody: { color: theme.textMuted, fontSize: theme.type.caption.size },
    captureNote: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
    doneWrap: { alignItems: 'center', paddingVertical: 20, gap: 4 },
    doneTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    doneBody: { color: theme.textMuted, fontSize: theme.type.body.size },
  })
