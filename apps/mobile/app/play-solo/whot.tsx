/**
 * Solo Whot vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/whot/SoloWhotClient.tsx`. Both share
 * the pure engine in `@fateround/shared/whot-solo` and the bot in
 * `@fateround/shared/whot-bot`, so gameplay is identical; this file is only
 * the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. We keep one `SoloWhotState` in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human move that hands the turn to the bot, an effect fires the
 *    bot's action on a short timeout so the human sees the play unfold.
 *  - No in-progress state persistence (yet). SecureStore's per-key cap makes a
 *    full serialised session (deck + hands) uncomfortable; the scoreboard is
 *    tiny and does persist. Reload survival is a Phase 2 follow-up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { WhotShape } from '@fateround/shared'
import {
  WHOT_SHAPE_LABELS,
  canPlayCard,
  getActivePickPenalty,
  getNormalizedPickStacks,
  hasPlayableCard,
  isDrawPileDepleted,
  parseWhotRules,
} from '@fateround/shared/whot'
import {
  SOLO_BOT_ID,
  SOLO_HUMAN_ID,
  initSoloWhot,
  soloChooseNumber,
  soloChooseShape,
  soloDraw,
  soloPlay,
  type SoloWhotState,
} from '@fateround/shared/whot-solo'
import { pickBotAction, type WhotBotDifficulty } from '@fateround/shared/whot-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { WhotCardFace } from '@/components/games/cards/WhotCardFace'
import { WHOT_SHAPE_COLORS, WhotShapeIcon } from '@/components/games/cards/WhotShapeIcon'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { clearSoloState, loadSoloState, saveSoloState } from '@/lib/solo-state-store'
import { logSoloPlayStarted } from '@/lib/solo-play'

const BOT_THINK_MS = 900
const WHOT_CALL_SHAPES: WhotShape[] = ['circle', 'triangle', 'cross', 'square', 'star']
const WHOT_CALL_NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]

// Match the web solo defaults: classic preset, all standard toggles on.
const SOLO_RULES = parseWhotRules({
  whot_pick3_enabled: true,
  whot_cards_enabled: true,
  whot_number_calls_enabled: true,
  whot_pick2_stacking: true,
})

const DIFFICULTY_OPTIONS: { value: WhotBotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

export default function SoloWhotScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<SoloWhotState | null>(null)
  const [difficulty, setDifficulty] = useState<WhotBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<SoloWhotState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    // Rehydrate an in-progress game if one is stored, else deal a fresh one.
    // Rules are re-attached from SOLO_RULES to survive future rule-shape edits.
    void loadSoloState<SoloWhotState>('solo-whot-state-v1', (raw): raw is SoloWhotState => {
      const r = raw as Partial<SoloWhotState> | null
      return !!r?.session?.turn_order && Array.isArray(r.hands)
    }).then((persisted) => {
      if (persisted) {
        setState({ ...persisted, rules: SOLO_RULES })
        if (persisted.outcome != null) scoredRef.current = true
      } else {
        setState(initSoloWhot({ rules: SOLO_RULES }))
        logSoloPlayStarted('whot', difficulty)
      }
    })
    void readSoloScoreboard('whot').then(setScoreboard)
    // Difficulty is captured for the analytics call only; the fresh init still
    // reads the initial 'normal' before the setter runs — that's fine as an
    // opening event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist every state change so an OS-level app kill mid-hand doesn't lose
  // the game. Fire-and-forget; errors are swallowed inside saveSoloState.
  useEffect(() => {
    if (state) void saveSoloState('solo-whot-state-v1', state)
  }, [state])

  // Score once per game.
  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome === 0 ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    scoredRef.current = true
    void recordSoloOutcome('whot', outcome).then(setScoreboard)
  }, [state])

  // Bot turn: fire on delay so the human sees the move unfold, not jump-cut.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: SoloWhotState; error?: string }
      if (action.type === 'play') next = soloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'draw') next = soloDraw(now, idx, Math.random)
      else if (action.type === 'choose_shape') next = soloChooseShape(now, idx, action.shape)
      else next = soloChooseNumber(now, idx, action.n)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = soloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = soloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseShape = useCallback((shape: WhotShape) => {
    const now = stateRef.current
    if (!now) return
    const r = soloChooseShape(now, 0, shape)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseNumber = useCallback((n: number) => {
    const now = stateRef.current
    if (!now) return
    const r = soloChooseNumber(now, 0, n)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    scoredRef.current = false
    void clearSoloState('solo-whot-state-v1')
    setState(initSoloWhot({ rules: SOLO_RULES }))
    logSoloPlayStarted('whot', difficulty)
  }, [difficulty])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('whot').then(setScoreboard)
  }, [])

  const turnPlayerId = state?.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = state != null && turnPlayerId === SOLO_HUMAN_ID && state.outcome == null
  const myHand = state?.hands[0] ?? []
  const botHandCount = state?.hands[1].length ?? 0
  const myCanPlay = useMemo(
    () => (state ? hasPlayableCard(myHand, state.session, state.rules) : false),
    [state, myHand]
  )
  const whotCallActive = state?.session.required_shape != null || state?.session.required_number != null
  const pickPenalty = state ? getActivePickPenalty(state.session) : { type: null, count: 0 }
  const drawCount = ((state?.session.draw_pile ?? []) as unknown[]).length
  const drawDepleted = state ? isDrawPileDepleted(state.session) : false

  const finished = state?.outcome != null
  const humanWon = state?.outcome === 0
  const isDraw = state?.outcome === 'draw'
  const chooseWhot = state?.session.phase === 'choose_whot' && isMyTurn

  const hintLine = useMemo(() => {
    if (!state || state.outcome != null) return null
    if (chooseWhot) return 'You played WHOT — call a shape or number below.'
    if (!isMyTurn) return `Bot (${difficulty}) is thinking…`
    if (pickPenalty.type) {
      return pickPenalty.type === 'pick2'
        ? `Pick 2 active — play a 2 (${pickPenalty.count}) or draw the penalty.`
        : `Pick 3 active — play a 5 (${pickPenalty.count}) or draw the penalty.`
    }
    if (state.session.required_number != null) return `Match number ${state.session.required_number} or play a WHOT.`
    if (state.session.required_shape) {
      return `Match ${WHOT_SHAPE_LABELS[state.session.required_shape]} or play a WHOT.`
    }
    return myCanPlay ? 'Your turn — tap a playable card.' : 'No playable card — tap Draw.'
  }, [state, chooseWhot, isMyTurn, difficulty, pickPenalty, myCanPlay])

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Whot — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Whot — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Difficulty</Text>
            <SegmentedControl<WhotBotDifficulty>
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTY_OPTIONS}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <View style={styles.seatRow}>
            <SeatChip label={`Bot (${difficulty})`} count={botHandCount} active={!isMyTurn && !finished} />
            <SeatChip label="You" count={myHand.length} active={isMyTurn} />
          </View>

          <CardTableArea
            topCard={state?.session.top_card ? <WhotCardFace card={state.session.top_card} big /> : null}
            pileCount={drawCount}
            hint={
              drawDepleted && !finished
                ? 'Deck empty — play a card or the game ends on lowest hand.'
                : whotCallActive && state?.session.required_shape
                  ? `Called: ${WHOT_SHAPE_LABELS[state.session.required_shape]}`
                  : whotCallActive && state?.session.required_number != null
                    ? `Called number: ${state.session.required_number}`
                    : null
            }
            drawAccent={theme.primary}
          />

          {hintLine ? <Text style={styles.hint}>{hintLine}</Text> : null}

          {!finished && isMyTurn && !chooseWhot ? (
            <View style={styles.actionsRow}>
              <AppButton
                label={pickPenalty.type ? `Draw ${pickPenalty.count}` : drawDepleted ? 'Deck empty' : 'Draw a card'}
                tone="secondary"
                onPress={humanDraw}
                disabled={drawDepleted && !myCanPlay ? false : false}
              />
            </View>
          ) : null}
        </SurfaceCard>

        {chooseWhot ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Call a shape</Text>
            <View style={styles.shapeRow}>
              {WHOT_CALL_SHAPES.map((shape) => (
                <Pressable
                  key={shape}
                  onPress={() => humanChooseShape(shape)}
                  style={[styles.shapeChip, { borderColor: WHOT_SHAPE_COLORS[shape] }]}
                >
                  <WhotShapeIcon shape={shape} size={22} />
                  <Text style={styles.shapeChipLabel}>{WHOT_SHAPE_LABELS[shape]}</Text>
                </Pressable>
              ))}
            </View>
            {state?.rules.numberCallsEnabled ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>…or call a number</Text>
                <View style={styles.numberRow}>
                  {WHOT_CALL_NUMBERS.map((n) => (
                    <Pressable key={n} onPress={() => humanChooseNumber(n)} style={styles.numberChip}>
                      <Text style={styles.numberChipLabel}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </SurfaceCard>
        ) : null}

        {!finished ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Your hand ({myHand.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handRow}>
              {myHand.map((card) => {
                const playable = isMyTurn && !chooseWhot && state != null && myCanPlayCard(state, card.id)
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => playable && humanPlay(card.id)}
                    disabled={!playable}
                    style={playable ? styles.handSlotPlayable : styles.handSlot}
                  >
                    <WhotCardFace card={card} playable={playable} />
                  </Pressable>
                )
              })}
            </ScrollView>
          </SurfaceCard>
        ) : null}

        {finished ? (
          <SurfaceCard>
            <Text style={styles.finishTitle}>{humanWon ? 'You won 🎉' : isDraw ? "It's a draw" : 'Bot wins'}</Text>
            <Text style={styles.finishSub}>Practice mode — no ranking, just for fun.</Text>

            <View style={styles.scoreRow}>
              <ScoreCell label="You" value={scoreboard.human} />
              <ScoreCell label="Bot" value={scoreboard.bot} />
              <ScoreCell label="Draws" value={scoreboard.draws} />
            </View>

            <View style={styles.finishActions}>
              <AppButton label="Play again" tone="primary" onPress={restart} fullWidth />
              <AppButton label="Reset scoreboard" tone="ghost" onPress={resetScore} fullWidth />
              <AppButton label="Back to home" tone="secondary" onPress={() => router.replace('/')} fullWidth />
            </View>
          </SurfaceCard>
        ) : null}
      </ScrollView>
    </View>
  )
}

// Per-card legality — mirrors the gate inside `soloPlay` so a disabled card
// doesn't offer a tappable state.
function myCanPlayCard(state: SoloWhotState, cardId: string): boolean {
  const card = state.hands[0].find((c) => c.id === cardId)
  if (!card) return false
  const { pickTwo, pickFive } = getNormalizedPickStacks(state.session)
  if (pickTwo > 0 && !(state.rules.pick2Stacking && card.number === 2)) return false
  if (state.rules.pick3Enabled && pickFive > 0 && card.number !== 5) return false
  return canPlayCard(card, state.session, state.rules)
}

function SeatChip({ label, count, active }: { label: string; count: number; active: boolean }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.seatChip, active && styles.seatChipActive]}>
      <Text style={[styles.seatLabel, active && styles.seatLabelActive]}>{label}</Text>
      <View style={[styles.seatBadge, active && styles.seatBadgeActive]}>
        <Text style={[styles.seatBadgeText, active && styles.seatBadgeTextActive]}>{count}</Text>
      </View>
    </View>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.scoreCell}>
      <Text style={styles.scoreValue}>{value}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
    headerCard: {},
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    headerTitle: { fontSize: theme.type.section.size, fontWeight: '800', color: theme.text },
    headerSub: { marginTop: 2, fontSize: theme.type.caption.size, color: theme.textMuted },
    label: {
      fontSize: theme.type.caption.size,
      color: theme.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    seatRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.sm },
    seatChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    seatChipActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    seatLabel: { flex: 1, color: theme.textMuted, fontWeight: '700', fontSize: theme.type.label.size },
    seatLabelActive: { color: theme.primaryMuted },
    seatBadge: {
      minWidth: 26,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.bg,
      alignItems: 'center',
    },
    seatBadgeActive: { backgroundColor: theme.primary },
    seatBadgeText: { color: theme.text, fontWeight: '800', fontSize: theme.type.caption.size },
    seatBadgeTextActive: { color: '#fff' },
    hint: {
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      marginTop: theme.space.sm,
    },
    actionsRow: {
      marginTop: theme.space.sm,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.space.sm,
    },
    sectionTitle: { color: theme.text, fontWeight: '700', fontSize: theme.type.label.size, marginBottom: 8 },
    shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    shapeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      backgroundColor: theme.surface,
    },
    shapeChipLabel: { color: theme.text, fontWeight: '700', fontSize: theme.type.label.size },
    numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    numberChip: {
      minWidth: 40,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
    },
    numberChipLabel: { color: theme.text, fontWeight: '800', fontSize: theme.type.label.size },
    handRow: { gap: 6, paddingRight: 8 },
    handSlot: { opacity: 0.65 },
    handSlotPlayable: {},
    finishTitle: { fontSize: theme.type.title.size, fontWeight: '800', color: theme.text, textAlign: 'center' },
    finishSub: {
      fontSize: theme.type.body.size,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    scoreRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md },
    scoreCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    scoreValue: { fontSize: theme.type.title.size, fontWeight: '800', color: theme.text },
    scoreLabel: {
      fontSize: theme.type.caption.size,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 2,
    },
    finishActions: { gap: theme.space.sm, marginTop: theme.space.md },
  })
