import { ReactNode, useRef } from 'react'
import { Animated, Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import type { ElevationLevel, Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { motion } from '@/constants/motion'
import { useHaptic, type HapticIntensity } from '@/hooks/useHaptic'

/**
 * Surface card primitive.
 *
 * Backwards-compatible evolution — old callers using `<SurfaceCard accent>`
 * still render identically. New callers get:
 *   - `elevation` — semantic depth (raised / floating / overlay).
 *   - `interactive` + `onPress` — press-scale animation + haptic feedback,
 *     giving cards the same interactive feel Button has.
 *   - `padding` / `gap` overrides — for the rare case a card wants its own
 *     spacing without style-sheet gymnastics.
 *
 * Premium-arc-ready: interactive press animation runs on Animated today;
 * swaps to Reanimated with the same API when the arc lands.
 */

type Props = {
  children: ReactNode
  style?: ViewStyle
  accent?: boolean
  /** Semantic elevation level. Default `none` — card sits flush on its background. */
  elevation?: ElevationLevel
  /** When true, adds press feedback (scale + haptic). Requires `onPress`. */
  interactive?: boolean
  onPress?: () => void
  /** Haptic played on press-in when interactive. Defaults to 'selection'. */
  haptic?: HapticIntensity | 'none'
  padding?: number
  gap?: number
}

export function SurfaceCard({
  children,
  style,
  accent = false,
  elevation = 'none',
  interactive = false,
  onPress,
  haptic,
  padding,
  gap,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const trigger = useHaptic()
  const scale = useRef(new Animated.Value(1)).current

  const inner = (
    <View
      style={[
        styles.card,
        accent && styles.accent,
        elevation !== 'none' && styles[`elev_${elevation}`],
        padding != null && { padding },
        gap != null && { gap },
        style,
      ]}
    >
      {children}
    </View>
  )

  if (!interactive || !onPress) return inner

  const resolvedHaptic: HapticIntensity | 'none' = haptic ?? 'selection'
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, ...motion.spring.press }).start()
    if (resolvedHaptic !== 'none') trigger(resolvedHaptic)
  }
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.spring.release }).start()
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button">
        {inner}
      </Pressable>
    </Animated.View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: theme.components.card.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.components.card.padding,
      gap: theme.space.md,
    },
    accent: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.borderAccent,
    },
    elev_raised: theme.components.elevation.raised,
    elev_floating: theme.components.elevation.floating,
    elev_overlay: theme.components.elevation.overlay,
  })
