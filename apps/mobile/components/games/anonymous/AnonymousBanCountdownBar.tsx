import { StyleSheet, Text, View } from 'react-native'
import { banSecondsLeft, formatBanCountdown } from '@fateround/shared/anonymous-messages'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Mirrors web AnonymousBanCountdownBar: a red "You are muted" card with a live
 * MM:SS countdown until the host's mute ends. `tick` is passed from the
 * parent's 1s interval so the countdown re-renders each second.
 */
export function AnonymousBanCountdownBar({ bannedUntil, tick }: { bannedUntil: string; tick: number }) {
  const styles = useThemedStyles(makeStyles)
  void tick
  const secondsLeft = banSecondsLeft(bannedUntil)
  if (secondsLeft <= 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.label}>You are muted</Text>
      <Text style={styles.count}>{formatBanCountdown(secondsLeft)}</Text>
      <Text style={styles.hint}>You can read messages but cannot send or reply until the mute ends.</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.error,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
      marginBottom: 8,
    },
    label: { color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    count: { color: theme.error, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
    hint: { color: theme.textFaint, fontSize: 11, textAlign: 'center' },
  })
