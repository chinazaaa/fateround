import { ReactNode } from 'react'
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = TextInputProps & {
  label: string
  hint?: string
  footer?: ReactNode
}

export function FormField({ label, hint, footer, style, ...inputProps }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
