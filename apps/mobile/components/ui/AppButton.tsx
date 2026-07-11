import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const isPrimary = variant === 'primary'
  const isSecondary = variant === 'secondary'

  return (
    <Pressable
      style={[
        styles.base,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : theme.primaryMuted} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary && styles.labelPrimary,
            isSecondary && styles.labelSecondary,
            variant === 'ghost' && styles.labelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: theme.primary,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  secondary: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    minHeight: 44,
  },
  disabled: { opacity: 0.45 },
  label: { fontSize: 17, fontWeight: '700' },
  labelPrimary: { color: '#fff' },
  labelSecondary: { color: theme.text },
  labelGhost: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
})
