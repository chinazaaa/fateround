import { StyleSheet, Text, View } from 'react-native'
import { mahjongTileBase, mahjongTileShortLabel } from '@fateround/shared/mahjong'

function tileColors(tile: string): { bg: string; fg: string; accent: string } {
  const base = mahjongTileBase(tile)
  const suit = base[0]
  if (suit === 'm') return { bg: '#fff7ed', fg: '#b91c1c', accent: '#dc2626' }
  if (suit === 'p') return { bg: '#eff6ff', fg: '#1d4ed8', accent: '#2563eb' }
  if (suit === 's') return { bg: '#ecfdf5', fg: '#047857', accent: '#059669' }
  if (base.startsWith('w') || base.startsWith('d')) return { bg: '#faf5ff', fg: '#6b21a8', accent: '#9333ea' }
  if (base.startsWith('f') || base.startsWith('se')) return { bg: '#fffbeb', fg: '#b45309', accent: '#d97706' }
  return { bg: '#f8fafc', fg: '#111827', accent: '#374151' }
}

export function MahjongTileFace({
  tile,
  compact,
  selected,
}: {
  tile: string
  compact?: boolean
  selected?: boolean
}) {
  const colors = tileColors(tile)
  const label = mahjongTileShortLabel(tile)
  const w = compact ? 32 : 44
  const h = compact ? 44 : 58

  return (
    <View
      style={[
        styles.tile,
        {
          width: w,
          height: h,
          backgroundColor: colors.bg,
          borderColor: selected ? '#f43f5e' : '#8f7a55',
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: colors.accent }]} />
      <Text style={[styles.label, { color: colors.fg, fontSize: compact ? 11 : 13 }]} numberOfLines={2}>
        {label}
      </Text>
      {tile !== mahjongTileBase(tile) ? <View style={styles.redDot} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 6,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  label: { fontWeight: '800', textAlign: 'center', lineHeight: 14 },
  redDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
  },
})
