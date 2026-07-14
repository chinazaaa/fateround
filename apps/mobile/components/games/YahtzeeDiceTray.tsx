import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DeadlineTimerBadge } from '@/components/ui/DeadlineTimerBadge'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { playSound } from '@/lib/sounds'

// Pip layouts on a 3x3 grid: [row, col] (0-indexed) for each dot of faces 1–6.
// Mirrors web `DIE_DOTS` so mobile draws real dice faces instead of digits.
const DIE_DOTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
}

const MAX_ROLLS = 3

function DiePips({ value, styles }: { value: number; styles: ReturnType<typeof makeStyles> }) {
  const dots = DIE_DOTS[value] ?? DIE_DOTS[1]!
  // Render a fixed 3x3 grid so pips land in the correct cells.
  return (
    <View style={styles.pipGrid}>
      {Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        const on = dots.some(([r, c]) => r === row && c === col)
        return (
          <View key={i} style={styles.pipCell}>
            {on ? <View style={styles.pip} /> : null}
          </View>
        )
      })}
    </View>
  )
}

/**
 * Interactive dice row + roll controls. Mirrors web `YahtzeeDiceTray` +
 * `YahtzeeChrome`: pip-face dice, a "KEEP" badge with a lift on held dice, a
 * tumbling roll animation (unheld dice cycle random faces for ~5 ticks), a
 * rolls-remaining pip indicator (x/3), a "tap dice to keep" hint, and an
 * out-of-rolls prompt.
 */
export function YahtzeeDiceTray({
  dice,
  held,
  rollsThisTurn,
  rollsRemaining,
  isMyTurn,
  interactive,
  onToggleHold,
  onRoll,
  rolling,
  timerActive,
  turnDeadlineAt,
}: {
  dice: number[]
  held: boolean[]
  rollsThisTurn: number
  rollsRemaining: number
  isMyTurn: boolean
  interactive: boolean
  onToggleHold: (index: number) => void
  onRoll: () => void
  rolling: boolean
  timerActive: boolean
  turnDeadlineAt?: string | null
}) {
  const styles = useThemedStyles(makeStyles)

  // Tumble animation: when the dice values change, unheld dice cycle through
  // random faces for a few ticks before settling on the real result.
  const [isRolling, setIsRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<number[]>(dice)
  const prevDiceRef = useRef<number[]>(dice)
  // Read the latest held state without re-running the effect (a hold tap during
  // the animation must not cancel it mid-flight).
  const heldRef = useRef<boolean[]>(held)
  heldRef.current = held

  useEffect(() => {
    const changed = dice.some((val, idx) => val !== prevDiceRef.current[idx])
    if (!changed) {
      setDisplayDice(dice)
      return
    }
    setIsRolling(true)
    playSound('dice')
    prevDiceRef.current = dice

    let ticks = 0
    const interval = setInterval(() => {
      setDisplayDice(dice.map((d, i) => (heldRef.current[i] ? d : Math.floor(Math.random() * 6) + 1)))
      ticks++
      if (ticks >= 5) {
        clearInterval(interval)
        setDisplayDice(dice)
        setIsRolling(false)
      }
    }, 60)

    return () => {
      clearInterval(interval)
      setIsRolling(false)
    }
  }, [dice])

  const hasRolled = rollsThisTurn > 0
  const canRoll = isMyTurn && rollsRemaining > 0
  const outOfRolls = isMyTurn && hasRolled && rollsRemaining <= 0

  return (
    <View style={styles.tray}>
      <View style={styles.diceRow}>
        {displayDice.map((value, index) => {
          const isHeld = held[index]
          const rollingThis = isRolling && !isHeld
          return (
            <View key={index} style={styles.dieSlot}>
              <Pressable
                style={[
                  styles.die,
                  isHeld && styles.dieHeld,
                  isHeld && styles.dieLift,
                  rollingThis && styles.dieRolling,
                ]}
                disabled={!interactive}
                onPress={() => onToggleHold(index)}
              >
                <DiePips value={value} styles={styles} />
              </Pressable>
              {isHeld ? (
                <View style={styles.keepBadge}>
                  <Text style={styles.keepText}>KEEP</Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {interactive ? <Text style={styles.holdHint}>tap dice to keep</Text> : null}

      {timerActive ? (
        <View style={styles.timerRow}>
          <DeadlineTimerBadge deadlineAt={turnDeadlineAt} active={timerActive} urgentAt={20} enableAlerts={isMyTurn} />
        </View>
      ) : null}

      {/* Rolls-remaining pip indicator (x/3). */}
      <View style={styles.rollPipsRow}>
        {Array.from({ length: MAX_ROLLS }).map((_, i) => (
          <View key={i} style={[styles.rollPip, i < rollsThisTurn && styles.rollPipUsed]} />
        ))}
        <Text style={styles.rollPipLabel}>
          {rollsThisTurn}/{MAX_ROLLS}
        </Text>
      </View>

      {outOfRolls ? (
        <Text style={styles.outOfRolls}>Pick a score from the board ↑</Text>
      ) : (
        <Pressable
          style={[styles.rollBtn, (!canRoll || rolling) && styles.rollBtnDisabled]}
          disabled={!canRoll || rolling}
          onPress={onRoll}
        >
          <Text style={styles.rollBtnText}>{hasRolled ? `Roll again (${rollsRemaining} left)` : 'Roll dice'}</Text>
        </Pressable>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tray: { gap: 10, alignItems: 'center' },
    diceRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'flex-end' },
    dieSlot: { alignItems: 'center' },
    // Die faces are functional game pieces on a dark tile — colors intentional.
    die: {
      width: 52,
      height: 52,
      borderRadius: 12,
      backgroundColor: '#17171d',
      borderWidth: 2,
      borderColor: '#374151',
      padding: 7,
    },
    dieHeld: { borderColor: theme.primary, backgroundColor: '#3f1d2b' },
    dieLift: { transform: [{ translateY: -4 }, { scale: 1.05 }] },
    dieRolling: { opacity: 0.85, transform: [{ rotate: '6deg' }] },
    pipGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
    pipCell: { width: '33.333%', height: '33.333%', alignItems: 'center', justifyContent: 'center' },
    // White pips on the dark die face — intentional.
    pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    keepBadge: {
      marginTop: 4,
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    // White on the solid primary badge — intentional.
    keepText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
    holdHint: { color: theme.textFaint, fontSize: 11, fontStyle: 'italic' },
    timerRow: { alignItems: 'center' },
    rollPipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rollPip: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.border,
    },
    rollPipUsed: { backgroundColor: theme.primary },
    rollPipLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginLeft: 2,
      fontVariant: ['tabular-nums'],
    },
    outOfRolls: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    rollBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
    rollBtnDisabled: { opacity: 0.45 },
    // White on the solid primary button — intentional.
    rollBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  })
