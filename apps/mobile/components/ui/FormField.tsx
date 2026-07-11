import { ReactNode } from 'react'
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native'
import { theme } from '@/constants/theme'

type Props = TextInputProps & {
  label: string
  hint?: string
  footer?: ReactNode
}

export function FormField({ label, hint, footer, style, ...inputProps }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={theme.textFaint}
        {...inputProps}
      />
      {footer}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.xs },
  label: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hint: {
    color: theme.textFaint,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 2,
  },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.text,
    fontSize: 17,
    paddingHorizontal: theme.space.md,
    paddingVertical: 14,
  },
})
