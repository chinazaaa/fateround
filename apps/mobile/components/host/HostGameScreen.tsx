import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { HostLobbyScreen } from '@/components/HostLobbyScreen'
import { HostRouter } from '@/components/host/HostRouter'
import { useHostGame } from '@/hooks/useHostGame'

type Props = {
  gameCode: string
  hostToken: string
}

/**
 * Host shell: lobby while waiting, in-game dashboard once active or finished.
 */
export function HostGameScreen({ gameCode, hostToken }: Props) {
  const { game, players, loading, reload } = useHostGame(gameCode)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f43f5e" size="large" />
      </View>
    )
  }

  if (!game) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f43f5e" size="large" />
      </View>
    )
  }

  const inLobby = game.status === 'waiting'

  if (inLobby) {
    return <HostLobbyScreen gameCode={gameCode} hostToken={hostToken} />
  }

  return (
    <HostRouter
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={() => void reload()}
    />
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
