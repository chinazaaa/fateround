/**
 * Daily Whot Puzzle play surface (mobile).
 *
 * Port of `src/components/daily/DailyWhotPuzzlePlay.tsx`. Clear your hand by
 * matching the top card's shape or number; Whot (20) is wild — the player
 * picks the next shape after playing it. Draws are capped at 5; hitting the
 * cap or clearing the hand auto-submits. Same scoring shape as web
 * (1000 base minus 40 per extra move / 60 per draw — enforced server-side).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
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

interface WhotCard {
  shape: string
  number: number
}

type WhotMove = { type: 'play'; card: WhotCard; chosenShape?: string } | { type: 'draw' }

interface SavedState {
  hand: WhotCard[]
  topCard: WhotCard
  currentShape: string
  marketIndex: number
  moves: WhotMove[]
  drawCount: number
}

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

const DRAW_CAP = 5
const ALL_SHAPES = ['circle', 'triangle', 'square', 'star', 'cross']

const SHAPE_COLORS: Record<string, string> = {
  circle: '#e74c3c',
  triangle: '#2ecc71',
  square: '#3498db',
  star: '#f1c40f',
  cross: '#9b59b6',
  whot: '#1a1a2e',
}

const SHAPE_ICONS: Record<string, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  star: '★',
  cross: '✚',
  whot: 'W',
}

function canPlay(card: WhotCard, topCard: WhotCard, currentShape: string): boolean {
  if (card.number === 20) return true
  return card.shape === currentShape || card.number === topCard.number
}

function hasLegalPlay(hand: WhotCard[], topCard: WhotCard, currentShape: string): boolean {
  return hand.some((c) => canPlay(c, topCard, currentShape))
}

export function DailyWhotPuzzlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const initial = useMemo<SavedState>(
    () => ({
      hand: [...((puzzle.hand ?? []) as WhotCard[])],
      topCard: puzzle.topCard as WhotCard,
      currentShape: puzzle.currentShape as string,
      marketIndex: 0,
      moves: [],
      drawCount: 0,
    }),
    [puzzle]
  )
  const marketDeck = useMemo(() => (puzzle.marketDeck ?? []) as WhotCard[], [puzzle.marketDeck])

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [state, setState] = useState<SavedState>(initial)
  const [pickingShape, setPickingShape] = useState(false)
  const [pendingCard, setPendingCard] = useState<WhotCard | null>(null)
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
    if (state.hand.length === 0 && state.moves.length > 0 && !submitRef.current) handleSubmit()
  }, [state.hand.length, state.moves.length, handleSubmit])

  useEffect(() => {
    if (state.drawCount >= DRAW_CAP && !submitRef.current) handleSubmit()
  }, [state.drawCount, handleSubmit])

  const playCard = (card: WhotCard, chosenShape?: string) => {
    if (submitted) return
    setState((prev) => {
      const idx = prev.hand.findIndex((c) => c.shape === card.shape && c.number === card.number)
      if (idx === -1) return prev
      const newHand = [...prev.hand]
      newHand.splice(idx, 1)
      const newShape = chosenShape ?? card.shape
      const move: WhotMove =
        card.number === 20 ? { type: 'play', card, chosenShape: chosenShape ?? card.shape } : { type: 'play', card }
      return { ...prev, hand: newHand, topCard: card, currentShape: newShape, moves: [...prev.moves, move] }
    })
  }

  const onCardTap = (card: WhotCard) => {
    if (submitted || pickingShape) return
    if (!canPlay(card, state.topCard, state.currentShape)) return
    if (card.number === 20) {
      setPendingCard(card)
      setPickingShape(true)
      return
    }
    playCard(card)
  }

  const onShapePick = (shape: string) => {
    if (!pendingCard) return
    playCard(pendingCard, shape)
    setPendingCard(null)
    setPickingShape(false)
  }

  const onDraw = () => {
    if (submitted || pickingShape) return
    if (state.drawCount >= DRAW_CAP) return
    setState((prev) => {
      const card = prev.marketIndex < marketDeck.length ? marketDeck[prev.marketIndex] : null
      if (!card) return prev
      return {
        ...prev,
        hand: [...prev.hand, card],
        marketIndex: prev.marketIndex + 1,
        moves: [...prev.moves, { type: 'draw' }],
        drawCount: prev.drawCount + 1,
      }
    })
  }

  const confirmSubmit = () => {
    Alert.alert('Submit now?', "The leaderboard uses the moves you've made so far.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Submit', style: 'destructive', onPress: handleSubmit },
    ])
  }

  const legalPlayExists = hasLegalPlay(state.hand, state.topCard, state.currentShape)
  const timerColor = elapsed >= maxSeconds - 10 ? theme.error : theme.text
  const topShape = state.topCard.shape
  const topBg = SHAPE_COLORS[topShape] ?? theme.surface

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>{state.moves.length} moves</Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Clear your hand by matching shape or number. Whot (20) is wild — pick the next shape. Fewer moves = higher
        score.
      </Text>

      <View style={[styles.discardCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.kicker}>Discard pile</Text>
        <View
          style={[
            styles.topCard,
            { backgroundColor: topBg, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.topIcon, { color: topShape === 'star' ? '#000' : '#fff' }]}>
            {SHAPE_ICONS[topShape] ?? '?'}
          </Text>
          <Text style={[styles.topNumber, { color: topShape === 'star' ? '#000' : '#fff' }]}>
            {state.topCard.number}
          </Text>
        </View>
        <Text style={styles.currentShapeRow}>
          Current shape:{' '}
          <Text style={{ color: SHAPE_COLORS[state.currentShape], fontWeight: '800' }}>
            {SHAPE_ICONS[state.currentShape]} {state.currentShape}
          </Text>
        </Text>
      </View>

      {pickingShape ? (
        <View style={[styles.pickShapeCard, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
          <Text style={styles.pickShapeTitle}>Choose next shape</Text>
          <View style={styles.pickShapeRow}>
            {ALL_SHAPES.map((shape) => (
              <Pressable
                key={shape}
                onPress={() => onShapePick(shape)}
                style={[styles.shapeChip, { backgroundColor: SHAPE_COLORS[shape] }]}
              >
                <Text style={[styles.shapeChipText, { color: shape === 'star' ? '#000' : '#fff' }]}>
                  {SHAPE_ICONS[shape]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {state.hand.length > 0 ? (
        <View>
          <Text style={styles.kicker}>Your hand ({state.hand.length})</Text>
          <View style={styles.handRow}>
            {state.hand.map((card, i) => {
              const legal = canPlay(card, state.topCard, state.currentShape)
              const bg = SHAPE_COLORS[card.shape] ?? theme.surface
              return (
                <Pressable
                  key={i}
                  onPress={() => onCardTap(card)}
                  disabled={!legal || submitted || pickingShape}
                  style={[
                    styles.card,
                    {
                      backgroundColor: bg,
                      borderColor: legal ? theme.primary : theme.border,
                      opacity: legal ? 1 : 0.4,
                    },
                  ]}
                >
                  <Text style={[styles.cardIcon, { color: card.shape === 'star' ? '#000' : '#fff' }]}>
                    {SHAPE_ICONS[card.shape] ?? '?'}
                  </Text>
                  <Text style={[styles.cardNumber, { color: card.shape === 'star' ? '#000' : '#fff' }]}>
                    {card.number}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : !submitted ? (
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>Hand cleared!</Text>
          <Text style={styles.doneBody}>Submitting…</Text>
        </View>
      ) : null}

      {state.hand.length > 0 && !legalPlayExists && !pickingShape && !submitted ? (
        <AppButton
          label={`Draw from market (${state.drawCount}/${DRAW_CAP})`}
          tone="secondary"
          fullWidth
          onPress={onDraw}
          disabled={state.drawCount >= DRAW_CAP}
        />
      ) : null}

      {state.hand.length > 0 && state.moves.length > 0 && !submitted ? (
        <AppButton
          label={`Submit (${state.moves.length} moves)`}
          tone="ghost"
          size="sm"
          fullWidth
          onPress={confirmSubmit}
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
    timerLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    discardCard: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8 },
    kicker: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    topCard: {
      width: 64,
      height: 96,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 2,
    },
    topIcon: { fontSize: 24 },
    topNumber: { fontSize: 15, fontWeight: '800' },
    currentShapeRow: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    pickShapeCard: { padding: 12, borderRadius: 14, borderWidth: 2, alignItems: 'center', gap: 12 },
    pickShapeTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    pickShapeRow: { flexDirection: 'row', gap: 8 },
    shapeChip: {
      width: 46,
      height: 46,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shapeChipText: { fontSize: 22 },
    handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    card: {
      width: 56,
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 2,
    },
    cardIcon: { fontSize: 22 },
    cardNumber: { fontSize: 14, fontWeight: '800' },
    doneWrap: { alignItems: 'center', paddingVertical: 30, gap: 4 },
    doneTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    doneBody: { color: theme.textMuted, fontSize: theme.type.body.size },
  })
