import { Pressable, StyleSheet } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import type { Theme } from '@/constants/theme'
import {
  useTheme,
  useThemedStyles,
  useThemeMode,
  type ThemeMode,
} from '@/constants/theme-context'

const CYCLE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const NEXT_LABEL: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

function ModeIcon({ mode, color }: { mode: ThemeMode; color: string }) {
  if (mode === 'light') {
    // Sun
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={4.2} stroke={color} strokeWidth={2} />
        {[
          [12, 2, 12, 4],
          [12, 20, 12, 22],
          [4.22, 4.22, 5.64, 5.64],
          [18.36, 18.36, 19.78, 19.78],
          [2, 12, 4, 12],
          [20, 12, 22, 12],
          [4.22, 19.78, 5.64, 18.36],
          [18.36, 5.64, 19.78, 4.22],
        ].map(([x1, y1, x2, y2], i) => (
          <Line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </Svg>
    )
  }
  if (mode === 'dark') {
    // Moon
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    )
  }
  // System — phone (follows the device setting)
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Line x1={12} y1={18} x2={12} y2={18} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  )
}

/**
 * Small icon button that cycles System → Light → Dark. `System` follows the
 * phone's appearance; the icon reflects the current mode. Selection persists.
 */
export function ThemeModeButton() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { mode, setMode } = useThemeMode()

  return (
    <Pressable
      onPress={() => setMode(CYCLE[mode])}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Appearance: ${NEXT_LABEL[mode]}. Tap to switch to ${NEXT_LABEL[CYCLE[mode]]}.`}
    >
      <ModeIcon mode={mode} color={theme.textSecondary} />
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
  })
