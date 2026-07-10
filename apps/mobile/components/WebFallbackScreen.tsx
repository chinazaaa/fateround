import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameWebUrl } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameCode: string
  gameType: GameType
  debugReason?: string
}

export function WebFallbackScreen({ gameCode, gameType, debugReason }: Props) {
  const url = gameWebUrl(gameCode)
  const label = gameType ? gameLabel(gameType) : 'This game'

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Play in browser</Text>
      <Text style={styles.body}>
        {label} is not in the native app yet. You can still join the same room on the web —
        web and mobile players can play together.
      </Text>
      {__DEV__ && debugReason ? (
        <Text style={styles.debug}>Dev: {debugReason}</Text>
      ) : null}
      <Pressable style={styles.button} onPress={() => void Linking.openURL(url)}>
        <Text style={styles.buttonText}>Open {gameCode} on web</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: '#9ca3af',
    fontSize: 16,
    lineHeight: 24,
  },
  debug: {
    color: '#fbbf24',
    fontSize: 12,
    fontFamily: 'Menlo',
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
