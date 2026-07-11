import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  hint?: string
}

type Props<T extends string> = {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function SegmentedControl<T extends string>({ value, options, onChange, disabled }: Props<T>) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option.value)}
              disabled={disabled}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
      {options.find((option) => option.value === value)?.hint ? (
        <Text style={styles.hint}>{options.find((option) => option.value === value)?.hint}</Text>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.xs },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: theme.space.xs },
  chip: {
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  chipSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: theme.primaryMuted,
  },
  hint: {
    color: theme.textFaint,
    fontSize: 12,
    lineHeight: 18,
  },
})
