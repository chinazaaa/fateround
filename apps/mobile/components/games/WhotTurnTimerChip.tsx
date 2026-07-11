import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Per-seat turn countdown chip (whot).
 *
 * Mirrors the web WhotPlaySurface seat `timeLabel`: the active seat carries a
 * live countdown that turns red when the clock runs low. The shared mobile
 * roster (CrazyEightsRoster) has no per-seat slot and is off-limits for whot to
 * edit, so this renders the countdown as a compact chip tied to the active
 * player's name, sitting directly above the roster. A single shared
 * Animated.Value drives a subtle pulse while the clock is urgent.
 */
export function WhotTurnTimerChip({
  turnName,
  seconds,
  urgentAt = 5,
}: {
  turnName: string
  seconds: number
  urgentAt?: number
}) {
  const styles = useThemedStyles(makeStyles)
  const urgent = seconds <= urgentAt
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!urgent) {
      pulse.stopAnimation(() => pulse.setValue(1))
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [urgent, pulse])

  return (
    <Animated.View
      style={[styles.chip, urgent && styles.chipUrgent, urgent && { opacity: pulse }]}
      accessibilityRole="timer"
    >
      <View style={[styles.dot, urgent && styles.dotUrgent]} />
      <Text style={[styles.name, urgent && styles.textUrgent]} numberOfLines={1}>
        {turnName}
      </Text>
      <Text style={[styles.time, urgent && styles.textUrgent]}>{seconds}s</Text>
    </Animated.View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'center',
      backgroundColor: theme.primarySoft,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    // Functional urgent-red state — kept fixed, not from the token table.
    chipUrgent: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.primary },
    dotUrgent: { backgroundColor: '#dc2626' },
    name: { color: theme.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    time: { color: theme.primary, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
    textUrgent: { color: '#b91c1c' },
  })
