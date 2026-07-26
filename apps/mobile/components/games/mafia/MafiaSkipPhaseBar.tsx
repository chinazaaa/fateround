import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

interface MafiaSkipPhaseBarProps {
  phase: 'day' | 'voting'
  skipRequestCount: number
  skipRequiredCount: number
  hasRequestedSkip: boolean
  disabled?: boolean
  onSkip: () => void
}

/**
 * Lets the town vote to skip ahead out of Discussion or Voting early instead of always
 * waiting out the full timer — same majority threshold as a lynch vote (floor(alive/2)+1).
 * Separate from the per-voter "abstain" skip on the roster grid during Voting, which only
 * clears that player's own vote.
 */
export function MafiaSkipPhaseBar({
  phase,
  skipRequestCount,
  skipRequiredCount,
  hasRequestedSkip,
  disabled,
  onSkip,
}: MafiaSkipPhaseBarProps) {
  const styles = useThemedStyles(makeStyles)
  const label = phase === 'day' ? 'Discussion' : 'Voting'
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        {hasRequestedSkip ? `Waiting for the rest of the town to skip ${label.toLowerCase()}…` : `Skip ${label}?`}
      </Text>
      <Pressable style={styles.btn} disabled={disabled || hasRequestedSkip} onPress={onSkip}>
        <Text style={styles.btnText}>
          ⏭ {hasRequestedSkip ? 'Skipped' : `Skip ${label}`} ({skipRequestCount}/{skipRequiredCount})
        </Text>
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    text: { flex: 1, color: theme.textMuted, fontSize: 12 },
    btn: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    btnText: { color: theme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  })
