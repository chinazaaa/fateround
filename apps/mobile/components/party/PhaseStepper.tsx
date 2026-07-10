import { StyleSheet, Text, View } from 'react-native'

export function PhaseStepper({
  steps,
  activeIndex,
}: {
  steps: string[]
  activeIndex: number
}) {
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 4 },
  stepWrap: { flex: 1, alignItems: 'center', gap: 4 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2a2a35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: '#f43f5e' },
  dotDone: { backgroundColor: '#166534' },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  label: { color: '#6b7280', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  labelActive: { color: '#fff' },
})
