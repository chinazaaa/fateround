import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { pulseTurnAlert } from '@/lib/local-turn-alerts'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Shows whose turn it is plus a live countdown when the host configured a turn
 * timer. Flips to an urgent state as time runs low. Mirrors the web
 * SnakeLadderTurnBar (secondsLeft / hasTimer / urgent).
 */
export function SnakeLadderTurnBar({
  turnPlayerName,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgentAt = 5,
}: {
  turnPlayerName?: string | null
  isMyTurn?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgentAt?: number
}) {
  const styles = useThemedStyles(makeStyles)
  const showTimer = !!hasTimer && secondsLeft != null && secondsLeft > 0
  const urgent = showTimer && (secondsLeft as number) <= urgentAt
  const prevSecondsRef = useRef(secondsLeft ?? 0)

  useEffect(() => {
    if (!showTimer) {
      prevSecondsRef.current = secondsLeft ?? 0
      return
    }
    const prev = prevSecondsRef.current
    const s = secondsLeft as number
    if (s <= urgentAt && prev > urgentAt) void pulseTurnAlert('urgent')
    prevSecondsRef.current = s
  }, [showTimer, secondsLeft, urgentAt])

  return (
    <View style={[styles.bar, isMyTurn && styles.barMine, urgent && styles.barUrgent]}>
      <Text style={[styles.label, isMyTurn && styles.labelMine]}>
        {isMyTurn ? 'Your turn' : turnPlayerName ? `${turnPlayerName}'s turn` : 'Waiting…'}
      </Text>
      {showTimer ? <Text style={[styles.secs, urgent && styles.secsUrgent]}>{secondsLeft}s</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    barMine: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    barUrgent: {
      // Functional urgent state — fixed amber, correct in both schemes.
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    label: {
      color: theme.textMuted,
      fontWeight: '700',
      fontSize: 14,
    },
    labelMine: {
      color: theme.text,
    },
    secs: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    secsUrgent: {
      color: '#f59e0b',
      fontWeight: '900',
    },
  })
