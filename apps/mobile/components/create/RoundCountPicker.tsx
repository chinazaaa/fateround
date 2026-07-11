import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  label: string
  hint?: string
  value: number
  options: readonly number[]
  onChange: (value: number) => void
}

function RoundStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
      <Text style={styles.stepHint}>
        {min}–{max} rounds
      </Text>
    </View>
  )
}

export function RoundCountPicker({ label, hint, value, options, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const min = options[0] ?? 1
  const max = options[options.length - 1] ?? value

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {options.length > 10 ? (
        <RoundStepper value={value} min={min} max={max} onChange={onChange} />
      ) : (
        <SegmentedControl
          value={String(value)}
          options={options.map((rounds) => ({
            value: String(rounds),
            label: String(rounds),
          }))}
          onChange={(next) => onChange(Number(next))}
        />
      )}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  field: { gap: theme.space.sm },
  label: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    color: theme.textFaint,
    fontSize: 12,
    lineHeight: 18,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  stepValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'center',
  },
  stepHint: {
    color: theme.textFaint,
    fontSize: 13,
    marginLeft: theme.space.xs,
  },
})
