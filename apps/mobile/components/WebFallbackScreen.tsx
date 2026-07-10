import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameWebUrl } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameCode: string
  gameType: GameType
}

export function WebFallbackScreen({ gameCode, gameType }: Props) {
  const url = gameWebUrl(gameCode)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Play in browser</Text>
      <Text style={styles.body}>
        {gameLabel(gameType)} is not in the native app yet. You can still join the same room on the web —
        web and mobile players can play together.
      </Text>
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
