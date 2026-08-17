import { ReactNode, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { useHaptic, type HapticIntensity } from '@/hooks/useHaptic'

/**
 * List-row primitive — the workhorse for any vertically-scanning list
 * (recent games, profile items, settings, trophy grid rows).
 *
 * Slots: `left` (icon / avatar), title + optional subtitle, `right` (chevron
 * / badge / switch). Optional `divider` renders a hairline below. Interactive
 * rows scale + haptic on press just like Button + SurfaceCard.
 *
 * Anti-pattern this replaces: hand-rolled `<Pressable style={...}><View flex-row>...</View></Pressable>`
 * everywhere. Every row now has consistent padding, hit-target height, and
 * dark-mode-aware divider.
 */

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
  onPress?: () => void
  disabled?: boolean
  /** Render a hairline divider below this row. */
  divider?: boolean
  /** Haptic played on press-in. Defaults to 'selection'. */
  haptic?: HapticIntensity | 'none'
  style?: ViewStyle
  /** Slightly denser row for compact lists (e.g. settings sheets). */
  dense?: boolean
}

export function ListRow({ title, subtitle, left, right, onPress, disabled, divider, haptic, style, dense }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const trigger = useHaptic()
  const scale = useRef(new Animated.Value(1)).current

  const resolvedHaptic: HapticIntensity | 'none' = haptic ?? 'selection'
  const interactive = !!onPress && !disabled

  const onPressIn = () => {
    if (!interactive) return
    Animated.spring(scale, { toValue: 0.99, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
    if (resolvedHaptic !== 'none') trigger(resolvedHaptic)
  }
  const onPressOut = () => {
    if (!interactive) return
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()
  }

  const content = (
    <View style={[styles.row, dense && styles.rowDense, disabled && styles.disabled, style]}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.body}>
        {typeof title === 'string' ? <Text style={styles.title}>{title}</Text> : title}
        {subtitle != null ? (
          typeof subtitle === 'string' ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  )

  const wrapped = interactive ? (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        disabled={disabled}
      >
        {content}
      </Pressable>
    </Animated.View>
  ) : (
    content
  )

  if (!divider) return wrapped
  return (
    <View>
      {wrapped}
      <View style={styles.divider} />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: theme.components.listRow.minHeight,
      paddingHorizontal: theme.components.listRow.paddingX,
      paddingVertical: theme.space.sm,
      gap: theme.space.md,
    },
    rowDense: { minHeight: 44, paddingVertical: theme.space.xs },
    disabled: { opacity: 0.5 },
    left: { alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: 2 },
    right: { alignItems: 'center', justifyContent: 'center' },
    title: { color: theme.text, fontSize: theme.type.section.size, fontWeight: theme.type.section.weight },
    subtitle: { color: theme.textMuted, fontSize: theme.type.caption.size, fontWeight: theme.type.caption.weight },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.components.listRow.dividerColor },
  })
