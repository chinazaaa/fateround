/**
 * Solo UNO (Match Up) vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/uno/SoloUnoClient.tsx`. Shares the
 * pure engine in `@fateround/shared/uno-solo` and the bot in
 * `@fateround/shared/uno-bot`; this file is only the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. `UnoSoloState` lives in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human move that hands the turn to the bot, an effect fires the
 *    bot's action on a short timeout so the play unfolds visibly.
 *  - Solo only exercises the `playing` + `choose_color` phases; the WD4
 *    challenge, 0-7 swap, UNO-call penalty, and Jump-In branches never run
 *    (mirrors web solo). Multi-Play IS supported via `unoSoloPlayMulti`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { UnoCard, UnoColor } from '@fateround/shared'
import {
  UNO_COLORS,
  UNO_COLOR_HEX,
  UNO_COLOR_LABELS,
  isDrawPileDepleted,
  multiSetGroupingOk,
  validateMultiSet,
} from '@fateround/shared/uno'
import {
  UNO_SOLO_BOT_ID,
  UNO_SOLO_HUMAN_ID,
  UNO_SOLO_MULTI_PLAY_MODE,
  initUnoSolo,
  isPlayable,
  unoSoloChooseColor,
  unoSoloDraw,
  unoSoloPlay,
  unoSoloPlayMulti,
  type UnoSoloState,
} from '@fateround/shared/uno-solo'
import { pickBotAction, type UnoBotDifficulty } from '@fateround/shared/uno-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { CardTableArea } from '@/components/games/cards/CardTableArea'
import { UnoCardFace } from '@/components/games/cards/UnoCardFace'
import { useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'

const BOT_THINK_MS = 900

const DIFFICULTY_OPTIONS: { value: UnoBotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

export default function SoloUnoScreen() {
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<UnoSoloState | null>(null)
  const [difficulty, setDifficulty] = useState<UnoBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const [multiMode, setMultiMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const stateRef = useRef<UnoSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    setState(initUnoSolo())
    void readSoloScoreboard('uno').then(setScoreboard)
  }, [])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome === 0 ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    scoredRef.current = true
    void recordSoloOutcome('uno', outcome).then(setScoreboard)
  }, [state])

  // Reset the multi-play selection when the turn or hand size changes — a stale
  // set could reference cards the last move played away.
  useEffect(() => {
    setMultiMode(false)
    setSelectedIds([])
  }, [state?.session.current_turn_index, state?.hands[0].length])

  // Bot loop.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(UNO_SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: UnoSoloState; error?: string }
      if (action.type === 'play') next = unoSoloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'play_multi') next = unoSoloPlayMulti(now, idx, action.cardIds, Math.random)
      else if (action.type === 'draw') next = unoSoloDraw(now, idx, Math.random)
      else next = unoSoloChooseColor(now, idx, action.color)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseColor = useCallback((color: UnoColor) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloChooseColor(now, 0, color)
    if (!r.error) setState(r.state)
  }, [])

  const humanPlayMulti = useCallback((cardIds: string[]) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloPlayMulti(now, 0, cardIds, Math.random)
    if (!r.error) {
      setState(r.state)
      setMultiMode(false)
      setSelectedIds([])
    }
  }, [])

  const restart = useCallback(() => {
    scoredRef.current = false
    setMultiMode(false)
    setSelectedIds([])
    setState(initUnoSolo())
  }, [])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('uno').then(setScoreboard)
  }, [])

  const turnPlayerId = state?.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = state != null && turnPlayerId === UNO_SOLO_HUMAN_ID && state.outcome == null
  const myHand = state?.hands[0] ?? []
  const drawCount = ((state?.session.draw_pile ?? []) as unknown[]).length
  const drawDepleted = state ? isDrawPileDepleted(state.session) : false
  const drawPenalty = state?.session.draw_penalty ?? 0

  const finished = state?.outcome != null
  const humanWon = state?.outcome === 0
  const isDraw = state?.outcome === 'draw'
  const choosingColor = isMyTurn && state?.session.phase === 'choose_color'

  const handById = useMemo(() => new Map(myHand.map((c) => [c.id, c])), [myHand])
  const selectedCards = useMemo(
    () => selectedIds.map((id) => handById.get(id)).filter((c): c is UnoCard => !!c),
    [selectedIds, handById]
  )
  const multiEnabled = isMyTurn && state?.session.phase === 'playing' && drawPenalty === 0 && myHand.length >= 2
  const canAddToSet = useCallback(
    (card: UnoCard): boolean => {
      if (!state) return false
      if (card.color === 'wild') return false
      if (selectedCards.length === 0) return isPlayable(state, card)
      return multiSetGroupingOk([...selectedCards, card], UNO_SOLO_MULTI_PLAY_MODE)
    },
    [state, selectedCards]
  )
  const multiValid =
    state != null &&
    multiMode &&
    selectedCards.length >= 2 &&
    validateMultiSet(selectedCards, state.session, UNO_SOLO_MULTI_PLAY_MODE) === null
  const toggleSelect = useCallback(
    (card: UnoCard) => {
      setSelectedIds((prev) =>
        prev.includes(card.id) ? prev.filter((id) => id !== card.id) : canAddToSet(card) ? [...prev, card.id] : prev
      )
    },
    [canAddToSet]
  )

  const hintLine = useMemo(() => {
    if (!state || finished) return null
    if (choosingColor) return 'You played a wild — pick a colour.'
    if (!isMyTurn) return `Bot (${difficulty}) is thinking…`
    if (drawPenalty > 0) return `Draw ${drawPenalty} pending — play a +2 to stack or Draw.`
    if (multiMode) {
      return selectedCards.length
        ? `${selectedCards.length} selected — tap Play set (or add matching cards).`
        : 'Tap matching cards to lay them down together.'
    }
    if (!myHand.some((c) => isPlayable(state, c))) return 'No playable card — tap Draw.'
    return 'Your turn — tap a playable card.'
  }, [state, choosingColor, isMyTurn, difficulty, drawPenalty, multiMode, selectedCards, myHand, finished])

  const requiredColor = state?.session.required_color ?? null
  const tableAccent = requiredColor ? UNO_COLOR_HEX[requiredColor as UnoColor] : '#334155'

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Match Up — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Match Up — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · classic rules · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Difficulty</Text>
            <SegmentedControl<UnoBotDifficulty>
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTY_OPTIONS}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <View style={styles.seatRow}>
            <SeatChip
              label={`Bot (${difficulty})`}
              count={state?.hands[1].length ?? 0}
              active={!isMyTurn && !finished}
            />
            <SeatChip label="You" count={myHand.length} active={isMyTurn} />
          </View>

          <CardTableArea
            topCard={state?.session.top_card ? <UnoCardFace card={state.session.top_card} big /> : null}
            pileCount={drawCount}
            hint={
              drawDepleted && !finished
                ? 'Draw pile empty — reshuffles from played cards.'
                : requiredColor
                  ? `Called: ${UNO_COLOR_LABELS[requiredColor as UnoColor]}`
                  : null
            }
            drawAccent={tableAccent}
          />

          {hintLine ? <Text style={styles.hint}>{hintLine}</Text> : null}

          {!finished && isMyTurn && !choosingColor ? (
            <View style={styles.actionsRow}>
              <AppButton
                label={drawPenalty > 0 ? `Draw ${drawPenalty}` : drawDepleted ? 'Deck empty' : 'Draw a card'}
                tone="secondary"
                onPress={humanDraw}
              />
              {multiEnabled ? (
                multiMode ? (
                  <>
                    <AppButton
                      label={`Play set (${selectedCards.length})`}
                      tone="primary"
                      disabled={!multiValid}
                      onPress={() => humanPlayMulti(selectedIds)}
                    />
                    <AppButton
                      label="Cancel"
                      tone="ghost"
                      onPress={() => {
                        setMultiMode(false)
                        setSelectedIds([])
                      }}
                    />
                  </>
                ) : (
                  <AppButton
                    label="Multi-Play"
                    tone="ghost"
                    onPress={() => {
                      setMultiMode(true)
                      setSelectedIds([])
                    }}
                  />
                )
              ) : null}
            </View>
          ) : null}
        </SurfaceCard>

        {choosingColor ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Choose a colour</Text>
            <View style={styles.colorRow}>
              {UNO_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => humanChooseColor(color)}
                  style={[styles.colorBtn, { backgroundColor: UNO_COLOR_HEX[color] }]}
                >
                  <Text style={styles.colorText}>{UNO_COLOR_LABELS[color]}</Text>
                </Pressable>
              ))}
            </View>
          </SurfaceCard>
        ) : null}

        {!finished ? (
          <SurfaceCard>
            <Text style={styles.sectionTitle}>Your hand ({myHand.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handRow}>
              {myHand.map((card) => {
                if (multiMode && multiEnabled) {
                  const selected = selectedIds.includes(card.id)
                  const eligible = selected || canAddToSet(card)
                  return (
                    <Pressable key={card.id} onPress={() => toggleSelect(card)} disabled={!eligible}>
                      <UnoCardFace card={card} playable={eligible && !selected} sel={selected} dim={!eligible} />
                    </Pressable>
                  )
                }
                const playable = state != null && isMyTurn && !choosingColor && isPlayable(state, card)
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => playable && humanPlay(card.id)}
                    disabled={!playable}
                    style={playable ? undefined : styles.handSlotDim}
                  >
                    <UnoCardFace card={card} playable={playable} />
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
    actionsRow: {
      marginTop: theme.space.sm,
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: theme.space.sm,
    },
    sectionTitle: { color: theme.text, fontWeight: '700', fontSize: theme.type.label.size, marginBottom: 8 },
    colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    colorBtn: {
      flex: 1,
      minWidth: 80,
      paddingVertical: 14,
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    colorText: { color: '#fff', fontWeight: '800', fontSize: theme.type.label.size, letterSpacing: 0.3 },
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
