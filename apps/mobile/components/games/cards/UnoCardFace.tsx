import { StyleSheet, Text, View } from 'react-native'
import type { UnoCard } from '@fateround/shared'
import { UNO_COLOR_HEX, cardShortLabel } from '@fateround/shared/uno'

const WILD_BG = '#111827'

export function UnoCardFace({
  card,
  compact,
  big,
  playable,
  sel,
  dim,
}: {
  card: UnoCard
  compact?: boolean
  big?: boolean
  playable?: boolean
  /** Multi-Play: this card is part of the set the player is building — highlighted. */
  sel?: boolean
  /** Multi-Play / Jump-In: this card can't join the current selection — faded. */
  dim?: boolean
}) {
  const isWild = card.color === 'wild'
  const bg = isWild ? WILD_BG : UNO_COLOR_HEX[card.color as keyof typeof UNO_COLOR_HEX]
  const label = cardShortLabel(card)

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        big && styles.cardBig,
        playable && styles.cardPlayable,
        sel && styles.cardSelected,
        dim && styles.cardDim,
        { backgroundColor: bg },
      ]}
    >
      <View style={styles.oval}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={[styles.label, big && styles.labelBig, card.kind === 'wild_draw4' && styles.labelSmall]}
        >
          {label}
        </Text>
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCompact: { width: 48, height: 68 },
  cardBig: { width: 66, height: 94, borderRadius: 10, padding: 8 },
  cardPlayable: { borderColor: '#fcd34d', borderWidth: 2 },
  cardSelected: { borderColor: '#22d3ee', borderWidth: 3 },
  cardDim: { opacity: 0.4 },
  oval: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 10,
    width: '86%',
    aspectRatio: 1.3,
  },
  label: { color: '#111827', fontSize: 15, fontWeight: '800' },
  labelBig: { fontSize: 18 },
  labelSmall: { fontSize: 11, letterSpacing: 0.2 },
})
