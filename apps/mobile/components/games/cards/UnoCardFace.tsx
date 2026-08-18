import { StyleSheet, Text, View } from 'react-native'
import type { UnoCard } from '@fateround/shared'
import { UNO_COLOR_HEX, cardShortLabel } from '@fateround/shared/uno'

const WILD_BG = '#111827'
// No Mercy wild variants — deep, saturated backdrops so they read distinctly from a classic
// black wild + from one another. Coloured No Mercy cards (Discard All, Skip Everyone) keep
// the colour of card.color; only the glyph changes.
const WILD_REV4_BG = '#4c1d95' // deep violet — "reverse" energy
const DRAW6_BG = '#7f1d1d' // deep crimson — "hurt more"
const DRAW10_BG = '#450a0a' // near-black crimson — "hurt most"
const ROULETTE_BG = '#0f766e' // teal — "spin"

function backgroundFor(card: UnoCard): string {
  if (card.kind === 'wild_reverse_draw4') return WILD_REV4_BG
  if (card.kind === 'draw6') return DRAW6_BG
  if (card.kind === 'draw10') return DRAW10_BG
  if (card.kind === 'wild_color_roulette') return ROULETTE_BG
  if (card.color === 'wild') return WILD_BG
  return UNO_COLOR_HEX[card.color as keyof typeof UNO_COLOR_HEX]
}

function centreGlyphFor(card: UnoCard): string {
  switch (card.kind) {
    case 'wild':
      return '🌈'
    case 'wild_draw4':
      return '+4'
    case 'wild_reverse_draw4':
      return '↺+4'
    case 'draw6':
      return '+6'
    case 'draw10':
      return '+10'
    case 'wild_color_roulette':
      return '🎡'
    case 'discard_all':
      return '⇊'
    case 'skip_everyone':
      return '⊘⊘'
    default:
      return cardShortLabel(card)
  }
}

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
  const bg = backgroundFor(card)
  const label = centreGlyphFor(card)
  // Longer glyphs (↺+4, +10, ⊘⊘) need a smaller font to fit the oval.
  const isLongGlyph =
    card.kind === 'wild_draw4' ||
    card.kind === 'wild_reverse_draw4' ||
    card.kind === 'draw10' ||
    card.kind === 'skip_everyone'

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
          style={[styles.label, big && styles.labelBig, isLongGlyph && styles.labelSmall]}
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
