import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  steps: string[]
  currentIndex: number
}

export function StepIndicator({ steps, currentIndex }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.row}>
      {steps.map((label, index) => {
        const active = index === currentIndex
        const done = index < currentIndex
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.dot, (active || done) && styles.dotActive]}>
              <Text style={[styles.dotText, (active || done) && styles.dotTextActive]}>{index + 1}</Text>
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space.md,
    alignItems: 'center',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bgElevated,
  },
  dotActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  dotText: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '800',
  },
  dotTextActive: {
    color: theme.primaryMuted,
  },
  label: {
    color: theme.textFaint,
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: {
    color: theme.text,
  },
})
