import { StyleSheet, Text, View } from 'react-native'
import { TimerBadge } from '@/components/ui/TimerBadge'

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
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {secondsLeft != null && secondsLeft > 0 ? <TimerBadge seconds={secondsLeft} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { color: '#d1d5db', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  detail: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
})
