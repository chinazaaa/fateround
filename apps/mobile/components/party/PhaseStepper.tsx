import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function PhaseStepper({
  steps,
  activeIndex,
}: {
  steps: string[]
  activeIndex: number
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.row}>
      {steps.map((label, index) => {
        const active = index === activeIndex
        const done = index < activeIndex
        return (
          <View key={label} style={styles.stepWrap}>
            <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]}>
              <Text style={styles.dotText}>{index + 1}</Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 4 },
  stepWrap: { flex: 1, alignItems: 'center', gap: 4 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: theme.primary },
  dotDone: { backgroundColor: '#166534' },
  // white on the colored active/done state dot — intentional
  dotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  label: { color: theme.textFaint, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  labelActive: { color: theme.text },
})
