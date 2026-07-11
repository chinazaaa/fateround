import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import { theme } from '@/constants/theme'

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
        const initials = player.name.trim().slice(0, 2).toUpperCase() || '?'
        return (
          <View key={player.id} style={[styles.chip, isTurn && styles.chipActive]}>
            <View style={[styles.avatar, isTurn && styles.avatarActive]}>
              <Text style={[styles.avatarText, isTurn && styles.avatarTextActive]}>{initials}</Text>
            </View>
            <View style={styles.meta}>
              <Text style={[styles.name, isTurn && styles.nameActive]} numberOfLines={1}>
                {player.name}
                {isMe ? ' (you)' : ''}
              </Text>
              <Text style={styles.cards}>
                {cards} card{cards === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: { gap: theme.space.sm, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 190,
  },
  chipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  avatarText: { color: theme.textSecondary, fontSize: 12, fontWeight: '800' },
  avatarTextActive: { color: '#fff' },
  meta: { gap: 1, flexShrink: 1 },
  name: { color: theme.text, fontWeight: '700', fontSize: 13 },
  nameActive: { color: theme.text },
  cards: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
})
