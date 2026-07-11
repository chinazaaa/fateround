import { StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { anonymousRoomMaxPlayers, countAnonymousRoomPresence } from './anonymous-room-helpers'

/**
 * Mirrors web AnonymousRoomHeadcount: a dedicated card showing
 * "In the lobby N / capacity" before start, and
 * "N players · M viewing / Players can chat · viewers are read-only" while active.
 */
export function AnonymousRoomHeadcount({ game, players }: { game: Game; players: Player[] }) {
  const styles = useThemedStyles(makeStyles)
  const inLobby = game.status === 'waiting'
  const capacity = anonymousRoomMaxPlayers(game)
  const { total, participants, viewers } = countAnonymousRoomPresence(players, game)

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{inLobby ? 'In the lobby' : 'In the room'}</Text>
      {inLobby ? (
        <Text style={styles.count}>
          {total}
          <Text style={styles.countFaint}> / {capacity}</Text>
        </Text>
      ) : (
        <View style={styles.right}>
          <Text style={styles.count}>
            {participants} {participants === 1 ? 'player' : 'players'}
            {viewers > 0 ? <Text style={styles.countFaint}> · {viewers} viewing</Text> : null}
          </Text>
          {viewers > 0 && participants > 0 ? (
            <Text style={styles.hint}>Players can chat · viewers are read-only</Text>
          ) : null}
        </View>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    label: { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    right: { alignItems: 'flex-end' },
    count: { color: theme.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    countFaint: { color: theme.textFaint, fontWeight: '400' },
    hint: { color: theme.textFaint, fontSize: 10, marginTop: 2 },
  })
