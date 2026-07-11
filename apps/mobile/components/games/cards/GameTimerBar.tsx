import { StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'

function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/** Slim whole-game countdown bar (overall session time, distinct from per-turn). */
export function GameTimerBar({
  secondsLeft,
  durationSeconds,
  label = 'Game time',
}: {
  secondsLeft: number
  durationSeconds: number
  label?: string
}) {
  const pct = durationSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / durationSeconds) * 100)) : 0
  const low = secondsLeft <= 60

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.time, low && styles.timeLow]}>{formatClock(secondsLeft)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }, low && styles.fillLow]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 5, alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    color: theme.textFaint,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  time: { color: theme.textSecondary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeLow: { color: theme.primary },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: theme.primaryMuted, borderRadius: 3 },
  fillLow: { backgroundColor: theme.primary },
})
