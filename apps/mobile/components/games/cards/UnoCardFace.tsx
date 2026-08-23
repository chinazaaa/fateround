import { StyleSheet, Text, View } from 'react-native'
import type { UnoCard } from '@fateround/shared'
import { cardShortLabel } from '@fateround/shared/uno'

// Web parity: solid UNO colour faces with a white centre oval (tilted −20°)
// carrying the value/symbol in the card's colour, plus a corner glyph in the
// top-left and bottom-right. Palette mirrors .pc.uno-* in
// src/app/fate-round-cardtable.css.
const UNO_FACE = {
  red: { bg: '#e2231a', glyph: '#e2231a', corner: '#fff' },
  yellow: { bg: '#f5b400', glyph: '#d99400', corner: '#3a2f00' },
  green: { bg: '#2fa317', glyph: '#2fa317', corner: '#fff' },
  blue: { bg: '#1a72d6', glyph: '#1a72d6', corner: '#fff' },
} as const

// Wild variants — a deep backdrop stands in for the web's rainbow ring, keeping
// the No Mercy wilds distinguishable at a glance.
const WILD_BG = '#1a1720'
const WILD_REV4_BG = '#4c1d95'
const DRAW6_BG = '#7f1d1d'
const DRAW10_BG = '#450a0a'
const ROULETTE_BG = '#0f766e'

function facePaint(card: UnoCard): { bg: string; glyph: string; corner: string } {
  if (card.kind === 'wild_reverse_draw4') return { bg: WILD_REV4_BG, glyph: '#1a1720', corner: '#fff' }
  if (card.kind === 'draw6') return { bg: DRAW6_BG, glyph: '#1a1720', corner: '#fff' }
  if (card.kind === 'draw10') return { bg: DRAW10_BG, glyph: '#1a1720', corner: '#fff' }
  if (card.kind === 'wild_color_roulette') return { bg: ROULETTE_BG, glyph: '#1a1720', corner: '#fff' }
  if (card.color === 'wild') return { bg: WILD_BG, glyph: '#1a1720', corner: '#fff' }
  return UNO_FACE[card.color as keyof typeof UNO_FACE]
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
  const paint = facePaint(card)
  const centre = centreGlyphFor(card)
  const wild = card.color === 'wild'
  const corner = wild ? centre : cardShortLabel(card)
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
        { backgroundColor: paint.bg },
      ]}
    >
      <Text
        style={[
          styles.corner,
          styles.cornerTL,
          big && styles.cornerBig,
          compact && styles.cornerCompact,
          { color: paint.corner },
        ]}
        numberOfLines={1}
      >
        {corner}
      </Text>
      <View style={[styles.oval, compact && styles.ovalCompact, big && styles.ovalBig]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={[
            styles.label,
            big && styles.labelBig,
            compact && styles.labelCompact,
            isLongGlyph && styles.labelLong,
            { color: paint.glyph },
          ]}
        >
          {centre}
        </Text>
      </View>
      <Text
        style={[
          styles.corner,
          styles.cornerBR,
          big && styles.cornerBig,
          compact && styles.cornerCompact,
          { color: paint.corner },
        ]}
        numberOfLines={1}
      >
        {corner}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 56,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  cardCompact: { width: 48, height: 68, borderRadius: 7 },
  cardBig: { width: 66, height: 94, borderRadius: 10 },
  // Web parity: playable cards get a bright green ring (matches --success on the web).
  cardPlayable: {
    borderColor: '#22c55e',
    borderWidth: 2,
    shadowColor: '#22c55e',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  cardSelected: { borderColor: '#22d3ee', borderWidth: 3 },
  // Non-playable cards fade + desaturate so a full hand isn't misread as "all playable".
  cardDim: { opacity: 0.45 },
  oval: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    width: 36,
    height: 36,
    transform: [{ rotate: '-20deg' }],
  },
  ovalCompact: { width: 30, height: 30 },
  ovalBig: { width: 48, height: 48 },
  label: {
    fontSize: 16,
    fontWeight: '900',
    transform: [{ rotate: '20deg' }],
  },
  labelCompact: { fontSize: 13 },
  labelBig: { fontSize: 20 },
  labelLong: { fontSize: 11, letterSpacing: 0.2 },
  corner: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
  },
  cornerCompact: { fontSize: 10 },
  cornerBig: { fontSize: 13, lineHeight: 14 },
  cornerTL: { top: 4, left: 5 },
  cornerBR: { bottom: 4, right: 5 },
})
