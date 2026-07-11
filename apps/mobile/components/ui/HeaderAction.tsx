import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import { theme } from '@/constants/theme'

type Props = {
  label: string
  onPress: () => void
  accent?: boolean
  style?: ViewStyle
}

export function HeaderAction({ label, onPress, accent = false, style }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        accent && styles.btnAccent,
        pressed && styles.pressed,
        style,
      ]}
      onPress={onPress}
      hitSlop={6}
    >
      <Text style={[styles.label, accent && styles.labelAccent]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  btnAccent: {
    borderColor: theme.borderAccent,
    backgroundColor: theme.primarySoft,
  },
  pressed: { opacity: 0.85 },
  label: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  labelAccent: {
    color: theme.primaryMuted,
  },
})
