import { StyleSheet, Text, View } from 'react-native'
import type { CrazyEightsCard } from '@fateround/shared'
import { isJoker } from '@fateround/shared/crazy-eights'

const SUIT_GLYPH: Record<string, string> = {
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diamonds: '♦',
}

const SUIT_COLOR: Record<string, string> = {
  spades: '#111827',
  clubs: '#111827',
  hearts: '#dc2626',
  diamonds: '#dc2626',
}

function rankLabel(rank: number): string {
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

export function PlayingCardFace({
  card,
  compact,
  playable,
}: {
  card: CrazyEightsCard
  compact?: boolean
  playable?: boolean
}) {
  const joker = isJoker(card)
  const suitColor = joker ? '#7c3aed' : SUIT_COLOR[card.suit] ?? '#111827'
  const glyph = joker ? '🃏' : SUIT_GLYPH[card.suit] ?? '?'
  const label = joker ? 'Joker' : rankLabel(card.rank)

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        playable && styles.cardPlayable,
        joker && styles.jokerCard,
      ]}
    >
      <Text style={[styles.rank, { color: suitColor }]}>{label}</Text>
      <Text style={[styles.suit, { color: suitColor }]}>{glyph}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 56,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 6,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCompact: { width: 48, height: 68 },
  cardPlayable: { borderColor: '#f43f5e', borderWidth: 2 },
  jokerCard: { backgroundColor: '#faf5ff' },
  rank: { fontSize: 16, fontWeight: '800' },
  suit: { fontSize: 22, alignSelf: 'center' },
})
