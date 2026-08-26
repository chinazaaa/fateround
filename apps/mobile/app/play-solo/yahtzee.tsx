/**
 * Solo Yahtzee vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/yahtzee/SoloYahtzeeClient.tsx`. Shares
 * the pure engine in `@fateround/shared/yahtzee-solo` and the bot in
 * `@fateround/shared/yahtzee-bot`; this file is only the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. `YahtzeeSoloState` lives in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human step that hands the turn to the bot, an effect walks the
 *    bot through roll → hold → score one step per timeout so each decision is
 *    visible instead of collapsing into one frame.
 *  - Sync via SecureStore scoreboard; in-game persistence is a Phase 2
 *    follow-up (see whot.tsx header note).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { YahtzeeCategory, YahtzeePlayerScore } from '@fateround/shared'
import {
  YAHTZEE_SOLO_BOT_ID,
  YAHTZEE_SOLO_HUMAN_ID,
  initYahtzeeSolo,
  rollYahtzeeSolo,
  scoreYahtzeeSolo,
  setYahtzeeSoloHold,
  yahtzeeSoloTotal,
  type YahtzeeSoloState,
} from '@fateround/shared/yahtzee-solo'
import { pickYahtzeeBotCategory, pickYahtzeeBotHold } from '@fateround/shared/yahtzee-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { YahtzeeDiceTray } from '@/components/games/YahtzeeDiceTray'
import { YahtzeeScorecardGrid } from '@/components/games/YahtzeeScorecardGrid'
import { useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import {
  clearSoloState,
  loadSoloState,
  markSoloStateScored,
  saveSoloState,
  wasSoloStateScored,
} from '@/lib/solo-state-store'
import { logSoloPlayFinished, logSoloPlayStarted, resetSoloSessionId, soloSessionId } from '@/lib/solo-play'

const BOT_STEP_MS = 700
const ROLL_ANIM_MS = 500

// The scorecard expects an array of YahtzeePlayerScore rows; solo carries a
// keyed record — same helper the web SoloYahtzeeClient uses.
function toYahtzeePlayerScores(state: YahtzeeSoloState, orderedIds: string[]): YahtzeePlayerScore[] {
  return orderedIds.map((id, i) => {
    const card = state.scores[id]!
    return {
      id: `solo-score-${i}`,
      game_id: 'solo',
      player_id: id,
      scores: {
        categories: card.categories,
        bonusYahtzees: card.bonusYahtzees,
        jokerUsed: card.jokerUsed,
      },
      player_order: i,
      created_at: '',
    } as YahtzeePlayerScore
  })
}

export default function SoloYahtzeeScreen() {
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<YahtzeeSoloState | null>(null)
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const [rolling, setRolling] = useState(false)
  const stateRef = useRef<YahtzeeSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    void loadSoloState<YahtzeeSoloState>('solo-yahtzee-state-v1', (raw): raw is YahtzeeSoloState => {
      const r = raw as Partial<YahtzeeSoloState> | null
      return !!r?.session?.turn_order && !!r.scores
    }).then(async (persisted) => {
      if (persisted) {
        setState(persisted)
        // See whot.tsx for the marker-vs-outcome gate rationale.
        if (persisted.outcome != null && (await wasSoloStateScored('solo-yahtzee-state-v1'))) {
          scoredRef.current = true
        }
      } else {
        setState(initYahtzeeSolo())
        logSoloPlayStarted('yahtzee')
      }
    })
    void readSoloScoreboard('yahtzee').then(setScoreboard)
  }, [])

  useEffect(() => {
    if (state) void saveSoloState('solo-yahtzee-state-v1', state)
  }, [state])

  // Score once per game.
  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome
    scoredRef.current = true
    void recordSoloOutcome('yahtzee', outcome).then((next) => {
      setScoreboard(next)
      void markSoloStateScored('solo-yahtzee-state-v1')
    })
    void soloSessionId('yahtzee').then((sessionId) => logSoloPlayFinished({ gameType: 'yahtzee', outcome, sessionId }))
  }, [state])

  // Bot loop — walk roll/hold/score one step per timeout.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const turnId = state.session.turn_order[state.session.current_turn_index]
    if (turnId !== YAHTZEE_SOLO_BOT_ID) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const dice = now.session.dice
      const rolls_this_turn = now.session.rolls_this_turn
      const rolls_remaining = now.session.rolls_remaining
      const card = now.scores[YAHTZEE_SOLO_BOT_ID]!.categories

      if (rolls_this_turn === 0) {
        setRolling(true)
        setTimeout(() => {
          const cur = stateRef.current
          if (!cur) return
          const r = rollYahtzeeSolo(cur, YAHTZEE_SOLO_BOT_ID)
          setRolling(false)
          if (!r.error) setState(r.state)
        }, ROLL_ANIM_MS)
        return
      }

      if (rolls_remaining === 0) {
        const cat = pickYahtzeeBotCategory(dice, card)
        const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_BOT_ID, cat)
        if (!r.error) setState(r.state)
        return
      }

      const action = pickYahtzeeBotHold(dice, rolls_remaining, card)
      if (action.kind === 'score') {
        const cat = pickYahtzeeBotCategory(dice, card)
        const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_BOT_ID, cat)
        if (!r.error) setState(r.state)
      } else {
        // Set hold bits first so the UI shows the held dice, then re-roll
        // after a beat so the tumble animation reads cleanly.
        const held = setYahtzeeSoloHold(now, YAHTZEE_SOLO_BOT_ID, action.hold)
        if (held.error) return
        setState(held.state)
        setRolling(true)
        setTimeout(() => {
          const cur = stateRef.current
          if (!cur) return
          const rolled = rollYahtzeeSolo(cur, YAHTZEE_SOLO_BOT_ID)
          setRolling(false)
          if (!rolled.error) setState(rolled.state)
        }, ROLL_ANIM_MS)
      }
    }, BOT_STEP_MS)
    return () => clearTimeout(t)
  }, [state])

  const humanToggleHold = useCallback((index: number) => {
    const now = stateRef.current
    if (!now) return
    if (now.session.rolls_this_turn < 1) return
    const nextHeld = [...now.session.held]
    nextHeld[index] = !nextHeld[index]
    const r = setYahtzeeSoloHold(now, YAHTZEE_SOLO_HUMAN_ID, nextHeld)
    if (!r.error) setState(r.state)
  }, [])

  const humanRoll = useCallback(() => {
    const now = stateRef.current
    if (!now || rolling) return
    setRolling(true)
    setTimeout(() => {
      const cur = stateRef.current
      if (!cur) return
      const r = rollYahtzeeSolo(cur, YAHTZEE_SOLO_HUMAN_ID)
      setRolling(false)
      if (!r.error) setState(r.state)
    }, ROLL_ANIM_MS)
  }, [rolling])

  const humanScore = useCallback((category: YahtzeeCategory) => {
    const now = stateRef.current
    if (!now) return
    const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_HUMAN_ID, category)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    scoredRef.current = false
    setRolling(false)
    void clearSoloState('solo-yahtzee-state-v1')
    void resetSoloSessionId('yahtzee')
    setState(initYahtzeeSolo())
    logSoloPlayStarted('yahtzee')
  }, [])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('yahtzee').then(setScoreboard)
  }, [])

  const players = useMemo(
    () => [
      { id: YAHTZEE_SOLO_HUMAN_ID, name: 'You' },
      { id: YAHTZEE_SOLO_BOT_ID, name: 'Bot' },
    ],
    []
  )

  const turnId = state?.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = state != null && turnId === YAHTZEE_SOLO_HUMAN_ID && state.outcome == null
  const finished = state?.outcome != null
  const humanWon = state?.outcome === 'human'
  const isDraw = state?.outcome === 'draw'
  const rolls_this_turn = state?.session.rolls_this_turn ?? 0
  const rolls_remaining = state?.session.rolls_remaining ?? 0
  const canRoll = isMyTurn && rolls_remaining > 0
  const canHold = isMyTurn && rolls_this_turn > 0 && rolls_remaining > 0

  const playerScores = useMemo(
    () => (state ? toYahtzeePlayerScores(state, [YAHTZEE_SOLO_HUMAN_ID, YAHTZEE_SOLO_BOT_ID]) : []),
    [state]
  )

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Five Dice — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Five Dice — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <Text style={styles.subtitle}>
            {finished ? 'Game over' : (state?.session.status_message ?? (isMyTurn ? 'Your turn' : "Bot's turn"))}
            {isMyTurn && rolls_remaining > 0 ? (
              <Text style={styles.subtitleFaint}>
                {' '}
                · {rolls_remaining} roll{rolls_remaining === 1 ? '' : 's'} left
              </Text>
            ) : null}
          </Text>
        </SurfaceCard>

        <SurfaceCard>
          {state ? (
            <YahtzeeDiceTray
              dice={state.session.dice}
              held={state.session.held}
              rollsThisTurn={rolls_this_turn}
              rollsRemaining={rolls_remaining}
              isMyTurn={isMyTurn}
              interactive={canHold}
              onToggleHold={humanToggleHold}
              onRoll={humanRoll}
              rolling={rolling}
              timerActive={false}
              turnDeadlineAt={null}
            />
          ) : (
            <Text style={styles.settingUp}>Setting up the game…</Text>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <YahtzeeScorecardGrid
            players={players}
            scores={playerScores}
            myPlayerId={YAHTZEE_SOLO_HUMAN_ID}
            activePlayerId={turnId ?? null}
            dice={state?.session.dice}
            scoringEnabled={isMyTurn && rolls_this_turn > 0 && !finished}
            onScore={isMyTurn && rolls_this_turn > 0 ? humanScore : undefined}
          />
          {state ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalText}>
                You: <Text style={styles.totalValue}>{yahtzeeSoloTotal(state, YAHTZEE_SOLO_HUMAN_ID)}</Text>
              </Text>
              <Text style={styles.totalText}>
                Bot: <Text style={styles.totalValue}>{yahtzeeSoloTotal(state, YAHTZEE_SOLO_BOT_ID)}</Text>
              </Text>
            </View>
          ) : null}
        </SurfaceCard>

        {finished ? (
          <SurfaceCard>
            <Text style={styles.finishTitle}>{humanWon ? 'You won 🎉' : isDraw ? "It's a draw" : 'Bot wins'}</Text>
            <Text style={styles.finishSub}>Practice mode — no ranking, just for fun.</Text>

            <View style={styles.scoreRow}>
              <ScoreCell label="You" value={scoreboard.human} />
              <ScoreCell label="Bot" value={scoreboard.bot} />
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
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    headerTitle: { fontSize: theme.type.section.size, fontWeight: '800', color: theme.text },
    headerSub: { marginTop: 2, fontSize: theme.type.caption.size, color: theme.textMuted },
    subtitle: { marginTop: 8, fontSize: theme.type.caption.size, color: theme.textMuted },
    subtitleFaint: { color: theme.textFaint ?? theme.textMuted },
    settingUp: { color: theme.textMuted, textAlign: 'center', padding: 20 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
    totalText: { color: theme.textMuted, fontSize: theme.type.caption.size },
    totalValue: { color: theme.text, fontWeight: '800' },
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
