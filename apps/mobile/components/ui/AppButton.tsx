import { useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { motion } from '@/constants/motion'
import { useHaptic, type HapticIntensity } from '@/hooks/useHaptic'

/**
 * Universal button primitive.
 *
 * Premium-ready surface (Premium arc — docs/mobile-revamp-plan.md) even though
 * some props are no-ops today:
 *   - `haptic` — routes through `useHaptic`, currently no-op; Premium arc
 *     wires expo-haptics once and every button gets tactile feedback.
 *   - `leftIcon` / `rightIcon` slots — accept any node, so the Premium arc's
 *     custom icon set drops in without a Button rewrite.
 *   - `size` / `tone` — enums (not raw styles) so a re-theme changes tokens,
 *     not consumer code.
 *
 * Backwards compatibility: the old `variant` prop still maps to `tone`, and
 * every existing call site (label + onPress) keeps rendering. New callers
 * should prefer the extended API.
 */

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

type Props = {
  label: string
  onPress: () => void
  /** Preferred: express intent (`primary` / `secondary` / `ghost` / `danger`). */
  tone?: Tone
  /** Deprecated alias for `tone`. Kept so pre-refactor call sites don't break. */
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: Size
  disabled?: boolean
  loading?: boolean
  /** Haptic played on press-in. Defaults to 'light' for primary, none for ghost. */
  haptic?: HapticIntensity | 'none'
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  /** Full-width or shrink to content. Defaults to shrink. */
  fullWidth?: boolean
  style?: ViewStyle
}

export function AppButton({
  label,
  onPress,
  tone,
  variant,
  size = 'md',
  disabled = false,
  loading = false,
  haptic,
  leftIcon,
  rightIcon,
  fullWidth,
  style,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const trigger = useHaptic()
  const scale = useRef(new Animated.Value(1)).current

  const resolvedTone: Tone = tone ?? variant ?? 'primary'
  const resolvedHaptic: HapticIntensity | 'none' =
    haptic ?? (resolvedTone === 'ghost' ? 'none' : resolvedTone === 'danger' ? 'medium' : 'light')

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
    if (resolvedHaptic !== 'none') trigger(resolvedHaptic)
  }
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()
  }

  const sized = styles[`size_${size}`]
  const toned = styles[`tone_${resolvedTone}`]
  const labelToned = styles[`label_${resolvedTone}`]
  const isPrimary = resolvedTone === 'primary'
  const isDanger = resolvedTone === 'danger'
  const spinnerColor = isPrimary || isDanger ? '#fff' : theme.primaryMuted

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        accessibilityLabel={label}
        style={[styles.base, sized, toned, (disabled || loading) && styles.disabled]}
        // motion.duration.press feeds into press-in easing on the Reanimated
        // migration; kept here as documentation of intent even though the
        // spring above doesn't consume a duration.
        {...({ delayPressIn: 0, delayPressOut: 0 } as const)}
      >
        {loading ? (
          <ActivityIndicator color={spinnerColor} />
        ) : (
          <View style={styles.content}>
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            <Text style={[styles.label, labelToned]}>{label}</Text>
            {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

// Keep the intent-token reference documented — `motion.duration.press` is
// re-consumed the moment we swap to Reanimated. Left as an unused import
// would trip the linter; declared here to keep the token surface visible.
void motion

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fullWidth: { alignSelf: 'stretch' },
    base: {
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.45 },
    label: { fontSize: theme.type.section.size, fontWeight: '700', letterSpacing: 0.1 },

    // Sizes
    size_sm: {
      minHeight: theme.components.button.height.sm,
      paddingHorizontal: theme.components.button.paddingX.sm,
    },
    size_md: {
      minHeight: theme.components.button.height.md,
      paddingHorizontal: theme.components.button.paddingX.md,
    },
    size_lg: {
      minHeight: theme.components.button.height.lg,
      paddingHorizontal: theme.components.button.paddingX.lg,
    },

    // Tones — primary drops the elevated shadow the old primary had, since
    // the press-scale animation now carries the "this is interactive" cue.
    // A dark-mode shadow on primary looked muddy; loss is intentional.
    tone_primary: { backgroundColor: theme.primary },
    tone_secondary: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    tone_ghost: { backgroundColor: 'transparent' },
    tone_danger: { backgroundColor: theme.error },

    label_primary: { color: '#fff' },
    label_secondary: { color: theme.text },
    label_ghost: { color: theme.textMuted, fontSize: theme.type.label.size, fontWeight: '600' },
    label_danger: { color: '#fff' },
  })
