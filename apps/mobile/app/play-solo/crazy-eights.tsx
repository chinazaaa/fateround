/**
 * Solo Crazy Eights vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/crazy-eights/SoloCrazyEightsClient.tsx`.
 * Shares the pure engine in `@fateround/shared/crazy-eights-solo` and the bot
 * in `@fateround/shared/crazy-eights-bot`; this file is only the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. `Crazy8SoloState` lives in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human move that hands the turn to the bot, an effect fires the
 *    bot's action on a short timeout so the play unfolds visibly.
 *  - Rules are the classic preset (action cards + jokers + Pick-2 stacking on).
 *  - No in-progress state persistence yet — Phase 2 follow-up. Scoreboard
 *    persists via SecureStore.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { CrazyEightsCalledSuit } from '@fateround/shared'
import {
  CRAZY8_SUITS,
  CRAZY8_SUIT_LABELS,
  CRAZY8_SUIT_SYMBOLS,
  canPlayCard,
  getNormalizedPenalties,
  hasPlayableCard,
  isDrawPileDepleted,
  parseCrazyEightsRules,
  specialCardShortLabel,
} from '@fateround/shared/crazy-eights'
import {
  CRAZY8_SOLO_BOT_ID,
  CRAZY8_SOLO_HUMAN_ID,
  crazy8SoloChooseSuit,
  crazy8SoloDraw,
  crazy8SoloPlay,
  initCrazy8Solo,
  type Crazy8SoloState,
} from '@fateround/shared/crazy-eights-solo'
import { pickBotAction, type Crazy8BotDifficulty } from '@fateround/shared/crazy-eights-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { PlayingCardFace } from '@/components/games/cards/PlayingCardFace'
import { useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { clearSoloState, loadSoloState, saveSoloState } from '@/lib/solo-state-store'
import { logSoloPlayStarted } from '@/lib/solo-play'

const BOT_THINK_MS = 900

// Match the web solo defaults: classic preset — actions, jokers, Pick-2 stacking.
const SOLO_RULES = parseCrazyEightsRules({
  crazy8_action_cards: true,
  crazy8_jokers: true,
  crazy8_pick2_stacking: true,
} as unknown as Parameters<typeof parseCrazyEightsRules>[0])

const DIFFICULTY_OPTIONS: { value: Crazy8BotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

const RED_SUITS = new Set<CrazyEightsCalledSuit>(['hearts', 'diamonds'])

export default function SoloCrazyEightsScreen() {
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<Crazy8SoloState | null>(null)
  const [difficulty, setDifficulty] = useState<Crazy8BotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<Crazy8SoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    void loadSoloState<Crazy8SoloState>('solo-crazy8-state-v1', (raw): raw is Crazy8SoloState => {
      const r = raw as Partial<Crazy8SoloState> | null
      return !!r?.session?.turn_order && Array.isArray(r.hands)
    }).then((persisted) => {
      if (persisted) {
        // Re-attach rules so a future rule-shape edit doesn't crash a rehydrate.
        setState({ ...persisted, rules: SOLO_RULES })
        if (persisted.outcome != null) scoredRef.current = true
      } else {
        setState(initCrazy8Solo({ rules: SOLO_RULES }))
        logSoloPlayStarted('crazy_eights', difficulty)
      }
    })
    void readSoloScoreboard('crazy_eights').then(setScoreboard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state) void saveSoloState('solo-crazy8-state-v1', state)
  }, [state])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome === 0 ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    scoredRef.current = true
    void recordSoloOutcome('crazy_eights', outcome).then(setScoreboard)
  }, [state])

  // Bot loop.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(CRAZY8_SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: Crazy8SoloState; error?: string }
      if (action.type === 'play') next = crazy8SoloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'draw') next = crazy8SoloDraw(now, idx, Math.random)
      else next = crazy8SoloChooseSuit(now, idx, action.suit)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseSuit = useCallback((suit: CrazyEightsCalledSuit) => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloChooseSuit(now, 0, suit)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    scoredRef.current = false
    void clearSoloState('solo-crazy8-state-v1')
    setState(initCrazy8Solo({ rules: SOLO_RULES }))
    logSoloPlayStarted('crazy_eights', difficulty)
  }, [difficulty])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('crazy_eights').then(setScoreboard)
  }, [])

  const turnPlayerId = state?.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = state != null && turnPlayerId === CRAZY8_SOLO_HUMAN_ID && state.outcome == null
  const myHand = state?.hands[0] ?? []
  const botHandCount = state?.hands[1].length ?? 0
  const myCanPlay = useMemo(
    () => (state ? hasPlayableCard(myHand, state.session, state.rules) : false),
    [state, myHand]
  )
  const suitCallActive = state?.session.required_suit != null
  const penalties = state ? getNormalizedPenalties(state.session) : { pickTwo: 0, jokerPenalty: 0 }
  const drawCount = ((state?.session.draw_pile ?? []) as unknown[]).length
  const drawDepleted = state ? isDrawPileDepleted(state.session) : false

  const finished = state?.outcome != null
  const humanWon = state?.outcome === 0
  const isDraw = state?.outcome === 'draw'
  const choosingSuit = isMyTurn && state?.session.phase === 'choose_suit'

  const hintLine = useMemo(() => {
    if (!state || state.outcome != null) return null
    if (choosingSuit) return 'You played a wild — call a suit below.'
    if (!isMyTurn) return `Bot (${difficulty}) is thinking…`
    if (penalties.pickTwo > 0) {
      return `Pick 2 active — play a 2 (${penalties.pickTwo}) or draw the penalty.`
    }
    if (penalties.jokerPenalty > 0) {
      return `Joker played — draw ${penalties.jokerPenalty} (no defence).`
    }
    if (state.session.required_suit) {
      return `Match ${CRAZY8_SUIT_LABELS[state.session.required_suit]} or play an 8/Joker.`
    }
    return myCanPlay ? 'Your turn — tap a playable card.' : 'No playable card — tap Draw.'
  }, [state, choosingSuit, isMyTurn, difficulty, penalties, myCanPlay])

  const requiredSuit = state?.session.required_suit ?? null

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Crazy Eights — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Crazy Eights — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Difficulty</Text>
            <SegmentedControl<Crazy8BotDifficulty>
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
            topCard={
              state?.session.top_card ? (
                <PlayingCardFace
                  card={state.session.top_card}
                  specialLabel={specialCardShortLabel(state.session.top_card, state.rules)}
                />
              ) : null
            }
            pileCount={drawCount}
            hint={
              drawDepleted && !finished
                ? 'Draw pile empty — reshuffles from played cards.'
                : requiredSuit
                  ? `Called: ${CRAZY8_SUIT_LABELS[requiredSuit]} ${CRAZY8_SUIT_SYMBOLS[requiredSuit]}`
                  : null
            }
          />

          {hintLine ? <Text style={styles.hint}>{hintLine}</Text> : null}

          {!finished && isMyTurn && !choosingSuit ? (
            <View style={styles.actionsRow}>
              <AppButton
                label={
                  penalties.pickTwo > 0
                    ? `Draw ${penalties.pickTwo}`
                    : penalties.jokerPenalty > 0
                      ? `Draw ${penalties.jokerPenalty}`
                      : drawDepleted
                        ? 'Deck empty'
                        : 'Draw a card'
                }
                tone="secondary"
                onPress={humanDraw}
              />
            </View>
          ) : null}
        </SurfaceCard>

        {choosingSuit ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Call a suit</Text>
            <View style={styles.suitRow}>
              {CRAZY8_SUITS.map((suit) => {
                const red = RED_SUITS.has(suit)
                return (
                  <Pressable key={suit} onPress={() => humanChooseSuit(suit)} style={styles.suitBtn}>
                    <Text style={[styles.suitSymbol, red && styles.suitSymbolRed]}>{CRAZY8_SUIT_SYMBOLS[suit]}</Text>
                    <Text style={styles.suitLabel}>{CRAZY8_SUIT_LABELS[suit]}</Text>
                  </Pressable>
                )
              })}
            </View>
          </SurfaceCard>
        ) : null}

        {!finished ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Your hand ({myHand.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handRow}>
              {myHand.map((card) => {
                const playable =
                  state != null && isMyTurn && !choosingSuit && canPlayCard(card, state.session, state.rules)
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => playable && humanPlay(card.id)}
                    disabled={!playable}
                    style={playable ? undefined : styles.handSlotDim}
                  >
                    <PlayingCardFace
                      card={card}
                      playable={playable}
                      specialLabel={state ? specialCardShortLabel(card, state.rules) : null}
                    />
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
    actionsRow: { marginTop: theme.space.sm, flexDirection: 'row', justifyContent: 'center', gap: theme.space.sm },
    sectionTitle: { color: theme.text, fontWeight: '700', fontSize: theme.type.label.size, marginBottom: 8 },
    suitRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    suitBtn: {
      flex: 1,
      minWidth: 70,
      paddingVertical: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      gap: 4,
    },
    suitSymbol: { fontSize: 26, color: theme.text, fontWeight: '800' },
    suitSymbolRed: { color: '#dc2626' },
    suitLabel: { fontSize: theme.type.caption.size, color: theme.textMuted, fontWeight: '600' },
    handRow: { gap: 6, paddingRight: 8 },
    handSlotDim: { opacity: 0.55 },
    finishTitle: { fontSize: theme.type.title.size, fontWeight: '800', color: theme.text, textAlign: 'center' },
    finishSub: { fontSize: theme.type.body.size, color: theme.textMuted, textAlign: 'center', marginTop: 4 },
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
