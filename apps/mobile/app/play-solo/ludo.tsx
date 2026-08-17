/**
 * Solo Ludo vs Bot — mobile screen.
 *
 * Mobile parallel of `src/app/play-solo/ludo/SoloLudoClient.tsx`. Shares the
 * pure engine in `@fateround/shared/ludo-solo` and the bot in
 * `@fateround/shared/ludo-bot`; this file is only the RN chrome.
 *
 * State model:
 *  - The pure engine owns the game. `LudoSoloState` lives in a ref for
 *    identity across microtask boundaries, mirrored to `useState` for renders.
 *  - After a human roll or move that hands the turn to the bot, an effect
 *    fires the bot's next action (roll or move) on a short timeout so the
 *    bot's chain of moves reads clearly instead of collapsing into a single
 *    frame.
 *  - No in-progress state persistence (yet) — Phase 2 follow-up along with
 *    Whot/Ayo. The scoreboard is SecureStore-persisted per game type.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import type { LudoDiceRoll, LudoPlayerState, Player } from '@fateround/shared'
import {
  dedupeLudoMovesForUi,
  parseLudoDice,
  resolveLudoMovesForTurn,
  resolveRemainingDice,
  START_POS,
  TRACK_LENGTH,
} from '@fateround/shared/ludo'
import { moveDestinationCell, trackCellsAlongSteps } from '@fateround/shared/ludo-board-layout'
import {
  LUDO_SOLO_BOT_ID,
  LUDO_SOLO_HUMAN_ID,
  applyLudoSoloMove,
  initLudoSolo,
  legalMovesForCurrentPlayer,
  rollLudoSolo,
  type LudoSoloState,
} from '@fateround/shared/ludo-solo'
import { pickLudoBotMove } from '@fateround/shared/ludo-bot'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { LudoBoard } from '@/components/games/ludo/LudoBoard'
import { LudoDicePair, LudoRemainingDice } from '@/components/games/ludo/LudoDice'
import { LudoMoveList } from '@/components/games/ludo/LudoMoveList'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { clearSoloState, loadSoloState, saveSoloState } from '@/lib/solo-state-store'
import { logSoloPlayStarted } from '@/lib/solo-play'

const BOT_THINK_MS = 700
const ROLL_ANIM_MS = 500

export default function SoloLudoScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  const [state, setState] = useState<LudoSoloState | null>(null)
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  // Held dice for the roll animation window — a spinning-dice illusion for
  // ~500ms before the freshly-rolled pair shows.
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<LudoDiceRoll | null>(null)
  const stateRef = useRef<LudoSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    void loadSoloState<LudoSoloState>('solo-ludo-state-v1', (raw): raw is LudoSoloState => {
      const r = raw as Partial<LudoSoloState> | null
      return !!r?.session?.turn_order && Array.isArray(r.session.turn_order) && Array.isArray(r.states)
    }).then((persisted) => {
      if (persisted) {
        setState(persisted)
        if (persisted.outcome != null) scoredRef.current = true
      } else {
        setState(initLudoSolo())
        logSoloPlayStarted('ludo')
      }
    })
    void readSoloScoreboard('ludo').then(setScoreboard)
  }, [])

  useEffect(() => {
    if (state) void saveSoloState('solo-ludo-state-v1', state)
  }, [state])

  // Sync displayDice with the freshly-rolled pair whenever the session's
  // last_dice changes (either from human roll or bot roll).
  useEffect(() => {
    if (!state) return
    setDisplayDice(parseLudoDice(state.session.last_dice))
  }, [state?.session.last_dice])

  // Score once per game.
  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' = state.outcome === 'human' ? 'human' : 'bot'
    scoredRef.current = true
    void recordSoloOutcome('ludo', outcome).then(setScoreboard)
  }, [state])

  // Bot loop: roll (roll phase) or pick + play a move (move phase). One step
  // per timeout so a bot playing three dice in a row is legible frame-by-frame
  // instead of jumping to the end.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const turnId = state.session.turn_order[state.session.current_turn_index]
    if (turnId !== LUDO_SOLO_BOT_ID) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      if (now.session.phase === 'roll') {
        setRolling(true)
        setDisplayDice(null)
        setTimeout(() => {
          const rolled = rollLudoSolo(now, LUDO_SOLO_BOT_ID)
          setRolling(false)
          if (!rolled.error) setState(rolled.state)
        }, ROLL_ANIM_MS)
      } else if (now.session.phase === 'move') {
        const botState = now.states.find((s) => s.player_id === LUDO_SOLO_BOT_ID)
        if (!botState) return
        const moves = legalMovesForCurrentPlayer(now)
        const chosen = pickLudoBotMove(moves, botState, {
          allStates: now.states,
          playerId: LUDO_SOLO_BOT_ID,
          remainingDice: now.session.remaining_dice ?? [],
          variant: now.variant,
        })
        if (chosen) {
          const played = applyLudoSoloMove(now, LUDO_SOLO_BOT_ID, chosen)
          if (!played.error) setState(played.state)
        }
      }
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state])

  const humanRoll = useCallback(() => {
    const now = stateRef.current
    if (!now || rolling) return
    setRolling(true)
    setDisplayDice(null)
    setTimeout(() => {
      const cur = stateRef.current
      if (!cur) return
      const r = rollLudoSolo(cur, LUDO_SOLO_HUMAN_ID)
      setRolling(false)
      if (!r.error) setState(r.state)
    }, ROLL_ANIM_MS)
  }, [rolling])

  const humanMove = useCallback((pieceId: number, diceIndex: number) => {
    const now = stateRef.current
    if (!now) return
    const moves = legalMovesForCurrentPlayer(now)
    const chosen = moves.find((m) => m.pieceId === pieceId && m.diceIndex === diceIndex)
    if (!chosen) return
    const r = applyLudoSoloMove(now, LUDO_SOLO_HUMAN_ID, chosen)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    scoredRef.current = false
    setDisplayDice(null)
    setRolling(false)
    void clearSoloState('solo-ludo-state-v1')
    setState(initLudoSolo())
    logSoloPlayStarted('ludo')
  }, [])

  const resetScore = useCallback(() => {
    void resetSoloScoreboard('ludo').then(setScoreboard)
  }, [])

  // Minimal `Player` rows for LudoBoard's name/avatar lookups — the multiplayer
  // Player has DB-only fields (game_id, gender, joined_at) the board doesn't
  // read; a cast keeps it lean without shimming meaningless defaults.
  const players = useMemo(
    () =>
      [
        { id: LUDO_SOLO_HUMAN_ID, name: 'You' },
        { id: LUDO_SOLO_BOT_ID, name: 'Bot' },
      ] as unknown as Player[],
    []
  )

  const turnId = state?.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = state != null && turnId === LUDO_SOLO_HUMAN_ID && state.outcome == null
  const myState = state?.states.find((s) => s.player_id === LUDO_SOLO_HUMAN_ID)
  const remainingDice = state ? resolveRemainingDice(state.session) : []

  const legalMoves = useMemo(() => {
    if (!state || !myState || !isMyTurn || state.session.phase !== 'move') return []
    return dedupeLudoMovesForUi(
      resolveLudoMovesForTurn(
        myState.color,
        myState.pieces,
        remainingDice,
        state.states,
        myState.player_id,
        state.variant
      )
    )
  }, [state, myState, isMyTurn, remainingDice])

  const highlightCells = useMemo(() => {
    if (!myState || legalMoves.length === 0) return undefined
    const cells = new Set<string>()
    for (const move of legalMoves) {
      const dest = moveDestinationCell(myState.color, move.to)
      if (dest) cells.add(`${Math.round(dest.row)},${Math.round(dest.col)}`)
      if (move.from.zone === 'track' && move.to.zone === 'track') {
        const steps = (move.from.pos - START_POS[myState.color] + TRACK_LENGTH) % TRACK_LENGTH
        for (const cell of trackCellsAlongSteps(myState.color, steps, move.diceValue)) {
          cells.add(`${Math.round(cell.row)},${Math.round(cell.col)}`)
        }
      }
    }
    return cells
  }, [legalMoves, myState])

  const finished = state?.outcome != null
  const humanWon = state?.outcome === 'human'
  const turnName = state ? (players.find((p) => p.id === turnId)?.name ?? 'Someone') : ''

  const rollHint = useMemo(() => {
    if (!state || finished) return null
    if (state.session.phase === 'roll' && isMyTurn)
      return 'Roll a 6 on either die to leave your yard onto your ★ start square.'
    if (state.session.phase === 'move' && isMyTurn && legalMoves.length === 0)
      return 'No legal moves for this roll — the turn will pass.'
    if (!isMyTurn) return `${turnName} is thinking…`
    return null
  }, [state, isMyTurn, legalMoves, finished, turnName])

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: 'Ludo — solo' }} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SurfaceCard>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Ludo — solo vs bot</Text>
              <Text style={styles.headerSub}>Practice mode · no room, no account</Text>
            </View>
            <AppButton label="New game" tone="secondary" size="sm" onPress={restart} />
          </View>
          <Text style={styles.subtitle}>{finished ? 'Game over' : isMyTurn ? 'Your turn' : `${turnName}'s turn`}</Text>
        </SurfaceCard>

        <SurfaceCard>
          {state ? (
            <LudoBoard
              states={state.states}
              players={players}
              legalMoves={legalMoves}
              myPlayerId={LUDO_SOLO_HUMAN_ID}
              isMyTurn={isMyTurn && state.session.phase === 'move'}
              highlightCells={highlightCells}
              onMovePiece={humanMove}
              acting={rolling}
              variant={state.variant}
              turnPlayerId={turnId}
            />
          ) : (
            <Text style={styles.settingUp}>Setting up the board…</Text>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <View style={styles.diceCard}>
            {state && state.session.phase === 'move' && remainingDice.length > 0 ? (
              <LudoRemainingDice remaining={remainingDice} />
            ) : (
              <LudoDicePair dice={rolling ? null : displayDice} rolling={rolling} />
            )}
            {state?.session.consecutive_sixes ? (
              <Text style={styles.bonus}>Bonus: {state.session.consecutive_sixes}/3</Text>
            ) : null}
          </View>

          {!finished && isMyTurn && state?.session.phase === 'roll' ? (
            <Pressable
              style={[styles.rollBtn, rolling && styles.rollBtnDisabled]}
              disabled={rolling}
              onPress={humanRoll}
            >
              <Text style={styles.rollBtnText}>{rolling ? 'Rolling…' : '🎲 Roll dice'}</Text>
            </Pressable>
          ) : null}

          {!finished && isMyTurn && state?.session.phase === 'move' && legalMoves.length > 0 && myState ? (
            <LudoMoveList
              moves={legalMoves}
              myColor={myState.color}
              remainingDice={remainingDice}
              acting={false}
              onMovePiece={humanMove}
            />
          ) : null}

          {rollHint ? <Text style={styles.hint}>{rollHint}</Text> : null}
        </SurfaceCard>

        {finished ? (
          <SurfaceCard>
            <Text style={styles.finishTitle}>{humanWon ? 'You won 🎉' : 'Bot wins'}</Text>
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
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    headerTitle: { fontSize: theme.type.section.size, fontWeight: '800', color: theme.text },
    headerSub: { marginTop: 2, fontSize: theme.type.caption.size, color: theme.textMuted },
    subtitle: { marginTop: 8, fontSize: theme.type.caption.size, color: theme.textMuted },
    settingUp: { color: theme.textMuted, textAlign: 'center', padding: 20 },
    diceCard: {
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
    },
    bonus: { color: '#fcd34d', fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
    rollBtn: {
      marginTop: 12,
      backgroundColor: theme.primary,
      borderRadius: theme.components.button.radius,
      paddingVertical: 14,
      alignItems: 'center',
    },
    rollBtnDisabled: { opacity: 0.45 },
    rollBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    hint: { color: theme.textMuted, textAlign: 'center', fontSize: theme.type.body.size, marginTop: 8 },
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
