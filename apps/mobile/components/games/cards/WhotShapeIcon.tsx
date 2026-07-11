import { StyleSheet, Text, View } from 'react-native'
import type { WhotShape } from '@fateround/shared'

export const WHOT_SHAPE_COLORS: Record<WhotShape, string> = {
  circle: '#60a5fa',
  cross: '#4ade80',
  triangle: '#fbbf24',
  square: '#f87171',
  star: '#a78bfa',
  whot: '#e879f9',
}

const GLYPH: Partial<Record<WhotShape, string>> = {
  triangle: '▲',
  star: '★',
  whot: '◆',
}

export function WhotShapeIcon({
  shape,
  size = 20,
  onCard,
}: {
  shape: WhotShape
  size?: number
  onCard?: boolean
}) {
  const color = onCard ? '#fff' : WHOT_SHAPE_COLORS[shape]

  if (shape === 'circle') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    )
  }

  if (shape === 'square') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    )
  }

  if (shape === 'cross') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.crossBar, { width: size * 0.28, height: size, backgroundColor: color, borderRadius: 2 }]} />
        <View
          style={[
            styles.crossBar,
            { width: size, height: size * 0.28, backgroundColor: color, borderRadius: 2 },
          ]}
        />
      </View>
    )
  }

  const glyph = GLYPH[shape] ?? '●'
  return (
    <Text style={{ color, fontSize: size * 0.9, lineHeight: size, fontWeight: '800' }}>{glyph}</Text>
  )
}

const styles = StyleSheet.create({
  crossBar: { position: 'absolute' },
})
