import { StyleSheet, Text, View } from 'react-native'
import {
  ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS,
} from '@fateround/shared/anonymous-messages'
import type { Game, Player } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MIN_MAX = 2
const MAX_MAX = 20

function roomCapacity(game: Pick<Game, 'max_players'> | null): number {
  if (!game || game.max_players == null) return ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS
  return Math.min(MAX_MAX, Math.max(MIN_MAX, game.max_players))
}

/**
 * Mirrors the web waiting screen's PlayerBar + LobbyPlayers + headcount:
 * your assigned lobby name, the full chip list of lobby names with
 * count/capacity, and the room headcount.
 */
export function AnonymousLobbyDetail({
  game,
  players,
  myName,
  subtitle,
}: {
  game: Pick<Game, 'max_players'> | null
  players: Player[]
  myName: string
  subtitle?: string
}) {
  const styles = useThemedStyles(makeStyles)
  const capacity = roomCapacity(game)
  const count = players.length

  return (
    <View style={styles.wrap}>
      <View style={styles.headcount}>
        <Text style={styles.headcountText}>
          {count} {count === 1 ? 'person' : 'people'} in room
        </Text>
      </View>

      {myName ? (
        <View style={styles.playerBar}>
          <Text style={styles.playerBarLabel}>Your lobby name</Text>
          <Text style={styles.playerBarName}>{myName}</Text>
          {subtitle ? <Text style={styles.playerBarSub}>{subtitle}</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardHeadLabel}>Lobby names</Text>
          <Text style={styles.cardHeadCount}>
            {count}
            {capacity != null ? ` / ${capacity}` : ''}
          </Text>
        </View>
        <View style={styles.chips}>
          {players.map((p) => (
            <View key={p.id} style={styles.chip}>
              <Text style={styles.chipText}>{p.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    headcount: { alignItems: 'center' },
    headcountText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    playerBar: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      alignItems: 'center',
      gap: 2,
    },
    playerBarLabel: { color: theme.textFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    playerBarName: { color: theme.text, fontSize: 16, fontWeight: '700' },
    playerBarSub: { color: theme.textFaint, fontSize: 11, textAlign: 'center', marginTop: 2 },
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeadLabel: { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardHeadCount: { color: theme.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
  })
