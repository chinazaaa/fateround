import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme, useThemeMode } from '@/constants/theme-context'

type Props = {
  /** Horizontal wordmark (header) or stacked icon + wordmark (hero). */
  variant?: 'horizontal' | 'stacked'
  /** Overall width — icon scales from this. */
  width?: number
}

/** Bright brand pink for "Round" — used as-is on dark, deepened on light. */
const ROUND_BRAND = '#ff8898'

function LogoMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 144 144" accessibilityLabel="Fate Round">
      <Defs>
        <LinearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#f43f5e" />
          <Stop offset="100%" stopColor="#e11d48" />
        </LinearGradient>
      </Defs>
      <Rect width={144} height={144} rx={32} fill="url(#logoBg)" />
      <G stroke="#ffffff" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.9}>
        <Path d="M72 40 L104 92 L40 92 Z" />
      </G>
      <Circle cx={72} cy={40} r={13} fill="#ffffff" />
      <Circle cx={104} cy={92} r={13} fill="#ffffff" />
      <Circle cx={40} cy={92} r={13} fill="#ffffff" />
    </Svg>
  )
}

function LogoWordmark({
  size,
  fateColor,
  roundColor,
}: {
  size: number
  fateColor: string
  roundColor: string
}) {
  return (
    <Text style={[styles.wordmark, { fontSize: size, lineHeight: size * 1.05 }]} accessibilityRole="header">
      <Text style={{ color: fateColor }}>Fate</Text>
      <Text style={{ color: roundColor }}>Round</Text>
    </Text>
  )
}

/** Branded Fate Round logo — SVG icon + native wordmark (avoids SVG Text layout events). */
export function FateRoundLogo({ variant = 'stacked', width = 220 }: Props) {
  const theme = useTheme()
  const { scheme } = useThemeMode()
  const iconSize = variant === 'stacked' ? width * 0.36 : width * 0.225
  const wordmarkSize = variant === 'stacked' ? width * 0.185 : width * 0.106

  // "Fate" was a fixed near-white, invisible on light. Follow the text color so
  // it reads in both schemes; deepen "Round" on light for contrast.
  const fateColor = theme.text
  const roundColor = scheme === 'light' ? theme.primary : ROUND_BRAND

  const icon = <LogoMark size={iconSize} />
  const wordmark = <LogoWordmark size={wordmarkSize} fateColor={fateColor} roundColor={roundColor} />

  if (variant === 'horizontal') {
    return (
      <View style={[styles.row, { width }]} accessibilityLabel="Fate Round">
        {icon}
        {wordmark}
      </View>
    )
  }

  return (
    <View style={[styles.stack, { width }]} accessibilityLabel="Fate Round">
      {icon}
      {wordmark}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
})
