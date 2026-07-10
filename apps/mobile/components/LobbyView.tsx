import { StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  game: Game
  players: Player[]
  myPlayerId: string | null
}

export function LobbyView({ game, players, myPlayerId }: Props) {
  const me = players.find((p) => p.id === myPlayerId)

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Lobby</Text>
      <Text style={styles.title}>{game.title || gameLabel(game.game_type)}</Text>
      <Text style={styles.meta}>
        {gameLabel(game.game_type)} · {game.status}
      </Text>
      {me ? <Text style={styles.you}>Playing as {me.name}</Text> : null}

      <Text style={styles.section}>Players ({players.length})</Text>
      <View style={styles.list}>
        {players.map((player) => (
          <View key={player.id} style={styles.row}>
            <Text style={styles.name}>{player.name}</Text>
            {player.spectator ? <Text style={styles.badge}>Viewer</Text> : null}
          </View>
        ))}
      </View>

      <Text style={styles.waiting}>
        {game.status === 'waiting'
          ? 'Waiting for the host to start…'
          : game.status === 'active'
            ? 'Game in progress — native screen coming in a later batch.'
            : 'This game has finished.'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 24,
    gap: 8,
  },
  kicker: {
    color: '#9ca3af',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  meta: {
    color: '#9ca3af',
    fontSize: 15,
    marginBottom: 8,
  },
  you: {
    color: '#fda4af',
    fontSize: 15,
    marginBottom: 12,
  },
  section: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  list: {
    gap: 8,
    marginTop: 4,
  },
  row: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 16,
  },
  badge: {
    color: '#9ca3af',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  waiting: {
    color: '#9ca3af',
    fontSize: 15,
    marginTop: 'auto',
    paddingTop: 16,
  },
})
