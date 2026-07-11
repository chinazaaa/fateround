import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'

export type SelectOption<T extends string> = {
  value: T
  label: string
  hint?: string
}

type Props<T extends string> = {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  /** Heading shown at the top of the option sheet. */
  title?: string
}

/**
 * Tappable field that opens a bottom sheet of options. Better than a
 * horizontal pill row when there are many choices — the current value stays
 * visible and the full list is one tap away.
 */
export function SelectField<T extends string>({ value, options, onChange, disabled, title }: Props<T>) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)

  const select = (next: T) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <>
      <Pressable
        style={[styles.trigger, disabled && styles.disabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
      >
        <Text style={styles.triggerLabel}>{current?.label ?? 'Select…'}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {options.map((option) => {
                const selected = option.value === value
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => select(option.value)}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                        {option.label}
                      </Text>
                      {option.hint ? <Text style={styles.rowHint}>{option.hint}</Text> : null}
                    </View>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: theme.space.md,
    paddingVertical: 14,
  },
  disabled: { opacity: 0.5 },
  triggerLabel: { color: theme.text, fontSize: 16, fontWeight: '700' },
  chevron: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xl,
    maxHeight: '70%',
  },
  sheetTitle: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.space.xs,
    paddingHorizontal: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.md,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  rowSelected: { backgroundColor: theme.primarySoft },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: theme.text, fontSize: 16, fontWeight: '600' },
  rowLabelSelected: { color: '#fff', fontWeight: '800' },
  rowHint: { color: theme.textFaint, fontSize: 12, lineHeight: 16 },
  check: { color: theme.primaryMuted, fontSize: 18, fontWeight: '800' },
})
