import { StyleSheet, Text, View } from 'react-native'
import { SelectField } from '@/components/create/SelectField'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  label: string
  hint?: string
  value: number
  options: readonly number[]
  format: (seconds: number) => string
  onChange: (value: number) => void
}

export function TimerPicker({ label, hint, value, options, format, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <SelectField
        value={String(value)}
        title={label}
        options={options.map((seconds) => ({
          value: String(seconds),
          label: format(seconds),
        }))}
        onChange={(next) => onChange(Number(next))}
      />
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
})
