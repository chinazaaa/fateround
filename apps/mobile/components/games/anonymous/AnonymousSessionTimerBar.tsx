import { StyleSheet, Text, View } from 'react-native'
import {
  ANONYMOUS_ROOM_SESSION_SECONDS,
  anonymousSessionSecondsLeft,
  formatSessionCountdown,
} from '@fateround/shared/anonymous-messages'
import type { Game } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const URGENT = '#fbbf24'

/**
 * Mirrors the web AnonymousSessionTimerBar: big MM:SS, a progress bar that
 * drains over the 15-minute session, amber urgency under 60s, and the
 * "ends automatically" copy. `tick` is passed from the parent's 1s interval so
 * the bar re-renders every second.
 */
export function AnonymousSessionTimerBar({
  game,
  tick,
}: {
  game: Pick<Game, 'status' | 'session_started_at'> | null
  tick: number
}) {
  const styles = useThemedStyles(makeStyles)
  void tick
  if (!game || game.status !== 'active' || !game.session_started_at) return null

  const secondsLeft = anonymousSessionSecondsLeft(game.session_started_at)
  const urgent = secondsLeft <= 60
  const progress = Math.max(0, Math.min(100, (secondsLeft / ANONYMOUS_ROOM_SESSION_SECONDS) * 100))

  return (
    <View style={[styles.card, urgent && styles.cardUrgent]}>
      <View style={styles.row}>
        <Text style={styles.label}>Time remaining</Text>
        <Text style={[styles.time, urgent && styles.timeUrgent]}>{formatSessionCountdown(secondsLeft)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress}%` }, urgent && styles.fillUrgent]} />
      </View>
      <Text style={styles.copy}>Session ends automatically after 15 minutes</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      marginBottom: theme.space.sm,
      gap: 8,
    },
    cardUrgent: { borderColor: URGENT },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    label: { color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    time: { color: theme.text, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timeUrgent: { color: URGENT },
    track: { height: 6, borderRadius: 999, backgroundColor: theme.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999, backgroundColor: theme.primary },
    fillUrgent: { backgroundColor: URGENT },
    copy: { color: theme.textFaint, fontSize: 11, textAlign: 'center' },
  })
