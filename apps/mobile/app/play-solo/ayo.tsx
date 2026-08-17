/**
 * Solo Ayo vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/ayo/SoloAyoClient.tsx`. Shares the pure
 * engine in `@fateround/shared/ayo-solo` and the bot in
 * `@fateround/shared/ayo-bot`; this file is only the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. We keep `AyoSoloState` in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human move that hands the turn to the bot, an effect fires the
 *    bot's move on a short timeout so the play unfolds visibly.
 *  - Sow animation runs in parallel with the state update, matching the
 *    multiplayer mobile Ayo view's cadence.
 *  - No in-progress state persistence (yet) — see whot.tsx header note. The
 *    scoreboard does persist via SecureStore.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { AyoSide } from '@fateround/shared'
import {
  AYO_SOLO_BOT_ID,
  AYO_SOLO_HUMAN_ID,
  ayoSoloConfig,
  ayoSoloLegalMoves,
  ayoSoloMove,
  initAyoSolo,
  type AyoSoloState,
} from '@fateround/shared/ayo-solo'
import { pickAyoBotMove, type AyoBotDifficulty } from '@fateround/shared/ayo-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { AyoBoard } from '@/components/games/ayo/AyoBoard'
import { useAyoSowAnimation } from '@/hooks/useAyoSowAnimation'
import { useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'

const BOT_THINK_MS = 700
const HUMAN_SIDE: AyoSide = 'a'
const BOT_SIDE: AyoSide = 'b'

const DIFFICULTY_OPTIONS: { value: AyoBotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

export default function SoloAyoScreen() {
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<AyoSoloState | null>(null)
  const [difficulty, setDifficulty] = useState<AyoBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<AyoSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)
  const { animation, playSowAnimation, clearAnimation } = useAyoSowAnimation()

  useEffect(() => {
    setState(initAyoSolo())
    void readSoloScoreboard('ayo').then(setScoreboard)
  }, [])

  // Score once per game.
  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' =
      state.outcome === 'a' ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    scoredRef.current = true
    void recordSoloOutcome('ayo', outcome).then(setScoreboard)
  }, [state])

  // Bot turn — fire after a short delay so the play is visible.
  useEffect(() => {
    if (!state || state.outcome != null) return
    if (state.session.current_turn !== BOT_SIDE) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const pit = pickAyoBotMove(now, difficulty)
      if (pit == null) return
      const config = ayoSoloConfig(now)
      // Fire animation optimistically; the state update lands next tick.
      void playSowAnimation(now.session.pits, pit, config)
      const next = ayoSoloMove(now, BOT_SIDE, pit)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty, playSowAnimation])

  const humanMove = useCallback(
    (pit: number) => {
      const now = stateRef.current
      if (!now) return
      const config = ayoSoloConfig(now)
      void playSowAnimation(now.session.pits, pit, config)
      const r = ayoSoloMove(now, HUMAN_SIDE, pit)
      if (!r.error) setState(r.state)
    },
    [playSowAnimation]
  )

  const restart = useCallback(() => {
    scoredRef.current = false
    clearAnimation()
    setState(initAyoSolo())
  }, [clearAnimation])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('ayo').then(setScoreboard)
  }, [])

  const isMyTurn = state?.session.current_turn === HUMAN_SIDE && state.outcome == null
  const finished = state?.outcome != null
  const humanWon = state?.outcome === 'a'
  const isDraw = state?.outcome === 'draw'
  const legal = useMemo(() => (state && isMyTurn ? ayoSoloLegalMoves(state, HUMAN_SIDE) : []), [state, isMyTurn])

  const hintLine = useMemo(() => {
    if (!state || finished) return null
    if (!isMyTurn) return `Bot (${difficulty}) is thinking…`
    return legal.length > 0 ? 'Your turn — tap one of your pits.' : 'No legal moves — the game will end.'
  }, [state, finished, isMyTurn, difficulty, legal])

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Ayo — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Ayo — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Difficulty</Text>
            <SegmentedControl<AyoBotDifficulty>
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTY_OPTIONS}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          {state ? (
            <AyoBoard
              session={state.session}
              mySide={HUMAN_SIDE}
              legal={legal}
              disabled={!isMyTurn || animation.animating}
              onMove={humanMove}
              animation={animation}
              variant={state.variant}
              nameA="You"
              nameB={`Bot (${difficulty})`}
            />
          ) : (
            <Text style={styles.settingUp}>Setting up the board…</Text>
          )}
          {hintLine ? <Text style={styles.hint}>{hintLine}</Text> : null}
        </SurfaceCard>

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
    settingUp: { color: theme.textMuted, textAlign: 'center', padding: 20 },
    hint: {
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      marginTop: theme.space.sm,
    },
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
