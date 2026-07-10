import { StyleSheet, Text, View } from 'react-native'

export function TimerBadge({ seconds, urgentAt = 5 }: { seconds: number; urgentAt?: number }) {
  const urgent = seconds <= urgentAt
  return (
    <View style={[styles.badge, urgent && styles.badgeUrgent]}>
      <Text style={styles.text}>{seconds}s</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#f43f5e',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  badgeUrgent: {
    backgroundColor: '#dc2626',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
})
