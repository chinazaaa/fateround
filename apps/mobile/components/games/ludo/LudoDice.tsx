import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LudoDiceRoll } from '@fateround/shared'

// [row, col] pip positions on a 3x3 grid — mirrors the web DICE_PIPS table.
const DICE_PIPS: Record<number, number[][]> = {
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
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
}

/**
 * A graphical Ludo die that visibly cycles pip faces while `rolling` is true, then
 * settles on `value`. Mirrors the web LudoDiceFace. Compact variant is used for the
 * per-die "remaining dice" row shown during the move phase.
 */
export function LudoDie({
  value,
  rolling,
  compact = false,
}: {
  value: number
  rolling?: boolean
  compact?: boolean
}) {
  const [cycle, setCycle] = useState(value)

  useEffect(() => {
    if (!rolling) return
    const id = setInterval(() => setCycle((v) => (v % 6) + 1), 80)
    return () => clearInterval(id)
  }, [rolling])

  const shown = rolling ? cycle : value
  const pips = DICE_PIPS[shown] ?? DICE_PIPS[1]!
  const size = compact ? 34 : 52
  const gridSize = compact ? 22 : 34
  const cellSize = gridSize / 3
  const pipSize = compact ? 5 : 8

  return (
    <View
      style={[
        styles.die,
        { width: size, height: size, borderRadius: compact ? 8 : 12 },
        rolling && styles.dieRolling,
      ]}
    >
      <View style={{ width: gridSize, height: gridSize, flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const show = pips.some(([r, c]) => r === row && c === col)
          return (
            <View key={i} style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}>
              {show ? (
                <View style={{ width: pipSize, height: pipSize, borderRadius: pipSize / 2, backgroundColor: '#0f172a' }} />
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

/**
 * The two rolled dice + total, with a "Double six!" callout. Cycles both faces while
 * `rolling`. Mirrors the web LudoDicePair.
 */
export function LudoDicePair({
  dice,
  rolling,
}: {
  dice: LudoDiceRoll | null | undefined
  rolling?: boolean
}) {
  const [cycle1, setCycle1] = useState(1)
  const [cycle2, setCycle2] = useState(2)

  useEffect(() => {
    if (!rolling) return
    const id = setInterval(() => {
      setCycle1((v) => (v % 6) + 1)
      setCycle2((v) => ((v + 2) % 6) + 1)
    }, 80)
    return () => clearInterval(id)
  }, [rolling])

  const d1 = rolling ? cycle1 : (dice?.d1 ?? 1)
  const d2 = rolling ? cycle2 : (dice?.d2 ?? 1)
  const doubleSix = !!dice && dice.d1 === 6 && dice.d2 === 6

  return (
    <View style={styles.pairWrap}>
      <View style={styles.pairRow}>
        <LudoDie value={d1} rolling={rolling} />
        <LudoDie value={d2} rolling={rolling} />
      </View>
      {dice && !rolling ? (
        <Text style={styles.total}>
          Total {dice.total}
          {doubleSix ? '  ·  Double six!' : ''}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * The compact per-die row shown while the mover still has dice to spend, plus a
 * "Use X" / "Use: a + b" hint. Mirrors the web LudoBoardCenter move-phase branch.
 */
export function LudoRemainingDice({ remaining }: { remaining: number[] }) {
  if (remaining.length === 0) return null
  return (
    <View style={styles.pairWrap}>
      <View style={styles.pairRow}>
        {remaining.map((value, index) => (
          <LudoDie key={`${index}-${value}`} value={value} compact />
        ))}
      </View>
      <Text style={styles.total}>
        {remaining.length === 1 ? `Use ${remaining[0]}` : `Use: ${remaining.join(' + ')}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // Die faces are functional game pieces — fixed white/dark, correct in both schemes.
  die: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dieRolling: {
    borderColor: '#fbbf24',
    transform: [{ scale: 1.05 }],
  },
  pairWrap: { alignItems: 'center', gap: 4 },
  pairRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  total: { color: '#fcd34d', fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
})
