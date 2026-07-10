import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { pulseTurnAlert } from '@/lib/local-turn-alerts'

export function TimerBadge({
  seconds,
  urgentAt = 5,
  enableAlerts = true,
}: {
  seconds: number
  urgentAt?: number
  enableAlerts?: boolean
}) {
  const urgent = seconds <= urgentAt
  const prevSecondsRef = useRef(seconds)

  useEffect(() => {
    if (!enableAlerts || seconds <= 0) {
      prevSecondsRef.current = seconds
      return
    }

    const prev = prevSecondsRef.current
    if (seconds <= urgentAt && prev > urgentAt) {
      void pulseTurnAlert('urgent')
    } else if (seconds === 0 && prev > 0) {
      void pulseTurnAlert('expired')
    }
    prevSecondsRef.current = seconds
  }, [seconds, urgentAt, enableAlerts])

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
