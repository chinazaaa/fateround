import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'

export function PlayerTurnRail({
  players,
  turnPlayerId,
  myPlayerId,
  handCounts,
}: {
  players: Player[]
  turnPlayerId: string | null
  myPlayerId: string | null
  handCounts: Record<string, number>
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {players.map((player) => {
        const isTurn = player.id === turnPlayerId
        const isMe = player.id === myPlayerId
        const cards = handCounts[player.id] ?? 0
        return (
          <View key={player.id} style={[styles.chip, isTurn && styles.chipActive]}>
            <Text style={styles.name} numberOfLines={1}>
              {player.name}
              {isMe ? ' · you' : ''}
            </Text>
            <Text style={styles.meta}>{cards} card{cards === 1 ? '' : 's'}</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: { gap: 8, paddingVertical: 4 },
  chip: {
    backgroundColor: '#17171d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2a2a35',
    maxWidth: 140,
  },
  chipActive: {
    borderColor: '#f43f5e',
    backgroundColor: '#2a1520',
  },
  name: { color: '#fff', fontWeight: '700', fontSize: 12 },
  meta: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
})
