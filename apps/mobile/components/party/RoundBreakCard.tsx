import { StyleSheet, Text, View } from 'react-native'
import { TimerBadge } from '@/components/ui/TimerBadge'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function RoundBreakCard({
  title,
  message,
  secondsLeft,
  detail,
}: {
  title: string
  message?: string | null
  secondsLeft?: number
  detail?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {secondsLeft != null && secondsLeft > 0 ? <TimerBadge seconds={secondsLeft} /> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { color: theme.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  detail: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
})
