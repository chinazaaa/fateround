import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { formatNpatGameDuration } from '@fateround/shared/npat'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

/**
 * Persistent "Game time left" bar for the optional timed I Call On session.
 * Mirrors web NpatGameTimerBar — hidden entirely for the untimed (all-26-letters)
 * mode where game_duration_seconds is 0/null.
 */
export function ICallOnGameTimerBar({
  game,
}: {
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
}) {
  const styles = useThemedStyles(makeStyles)
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at ?? null, duration, active)

  if (!active) return null

  const urgent = secondsLeft <= 60
  const progress = Math.max(0, Math.min(100, (secondsLeft / duration) * 100))

  return (
    <View style={[styles.bar, urgent && styles.barUrgent]}>
      <View style={styles.row}>
        <Text style={styles.label}>Game time left</Text>
        <Text style={[styles.time, urgent && styles.timeUrgent]}>{formatCountdown(secondsLeft)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, urgent && styles.fillUrgent, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.note}>
        {formatNpatGameDuration(duration)} session — play as many letters as time allows
      </Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    barUrgent: { borderColor: '#f59e0b59', backgroundColor: 'rgba(245,158,11,0.08)' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    time: { color: theme.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timeUrgent: { color: '#f59e0b' },
    track: { height: 4, borderRadius: 2, backgroundColor: theme.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 2, backgroundColor: theme.primary },
    fillUrgent: { backgroundColor: '#f59e0b' },
    note: { color: theme.textMuted, fontSize: 10, textAlign: 'center' },
  })
