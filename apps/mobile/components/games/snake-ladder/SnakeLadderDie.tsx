import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

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
 * A graphical die that visibly cycles pip faces while `rolling` is true, then
 * settles on `value`. Mirrors the web SnakeLadderDie.
 */
export function SnakeLadderDie({ value, rolling }: { value: number; rolling?: boolean }) {
  const [cycle, setCycle] = useState(value)

  useEffect(() => {
    if (!rolling) return
    const id = setInterval(() => setCycle((v) => (v % 6) + 1), 80)
    return () => clearInterval(id)
  }, [rolling])

  const shown = rolling ? cycle : value
  const pips = DICE_PIPS[shown] ?? DICE_PIPS[1]!

  return (
    <View style={[styles.die, rolling && styles.dieRolling]}>
      <View style={styles.grid}>
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const show = pips.some(([r, c]) => r === row && c === col)
          return (
            <View key={i} style={styles.cell}>
              {show ? <View style={styles.pip} /> : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Die faces are functional game pieces — fixed white/dark, correct in both schemes.
  die: {
    width: 56,
    height: 56,
    borderRadius: 12,
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
  grid: {
    width: 36,
    height: 36,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0f172a',
  },
})
