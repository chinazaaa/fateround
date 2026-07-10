import { StyleSheet, Text, View } from 'react-native'
import type { WhotCard } from '@fateround/shared'
import { WHOT_SHAPE_COLORS, WhotShapeIcon } from './WhotShapeIcon'

export function WhotCardFace({
  card,
  compact,
  playable,
}: {
  card: WhotCard
  compact?: boolean
  playable?: boolean
}) {
  const isWhot = card.number === 20
  const accent = WHOT_SHAPE_COLORS[card.shape]

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        playable && styles.cardPlayable,
        { backgroundColor: isWhot ? '#581c87' : accent },
      ]}
    >
      <Text style={styles.number}>{isWhot ? 'WHOT' : card.number}</Text>
      <WhotShapeIcon shape={card.shape} size={compact ? 18 : 22} onCard />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 56,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 6,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCompact: { width: 48, height: 68 },
  cardPlayable: { borderColor: '#fcd34d', borderWidth: 2 },
  number: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
