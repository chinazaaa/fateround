import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import {
  useThemedStyles,
  useThemeMode,
  type ThemeMode,
} from '@/constants/theme-context'

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * Segmented System / Light / Dark control. `System` follows the phone's
 * appearance setting; Light and Dark override it. Selection persists.
 */
export function ThemeModeToggle() {
  const styles = useThemedStyles(makeStyles)
  const { mode, setMode } = useThemeMode()

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Appearance</Text>
      <View style={styles.track}>
        {OPTIONS.map((opt) => {
          const active = mode === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => setMode(opt.value)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.xs },
    label: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingLeft: 2,
    },
    track: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.pill,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: theme.radius.pill,
    },
    segmentActive: {
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
    },
    segmentText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: theme.primaryMuted,
    },
  })
