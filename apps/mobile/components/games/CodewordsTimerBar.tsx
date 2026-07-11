import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { pulseTurnAlert } from '@/lib/local-turn-alerts'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Dedicated Codewords turn-timer bar. Mirrors the web CodewordsTimerBar +
 * timer-alert behaviour: a contextual label ("Spymaster timer" / "Operative
 * timer" / "Waiting for clue"), a large countdown, an amber urgent state as the
 * deadline approaches, and a haptic pulse when it turns urgent / expires (only
 * while the local player is on the clock).
 */
export function CodewordsTimerBar({
  label,
  seconds,
  urgentAt = 10,
  enableAlerts = false,
}: {
  label: string
  seconds: number
  urgentAt?: number
  enableAlerts?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const urgent = seconds <= urgentAt
  const prevSecondsRef = useRef(seconds)

  useEffect(() => {
    if (!enableAlerts) {
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
    <View style={[styles.bar, urgent && styles.barUrgent]}>
      <Text style={[styles.label, urgent && styles.labelUrgent]}>{label}</Text>
      <Text style={[styles.count, urgent && styles.countUrgent]}>{seconds}s</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 8,
    },
    // Functional amber urgent state — fixed in both schemes.
    barUrgent: { borderColor: '#f59e0b', backgroundColor: '#f59e0b1a' },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    labelUrgent: { color: '#b45309' },
    count: {
      color: theme.text,
      fontSize: 26,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    countUrgent: { color: '#b45309' },
  })
