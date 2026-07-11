import { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { theme } from '@/constants/theme'

type Props = {
  children: ReactNode
  style?: ViewStyle
  accent?: boolean
}

export function SurfaceCard({ children, style, accent = false }: Props) {
  return <View style={[styles.card, accent && styles.accent, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  accent: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.borderAccent,
  },
})
