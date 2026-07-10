import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { gameWebUrl } from '@/lib/config'

type Props = {
  gameCode: string
  title?: string
  body?: string
  actionLabel?: string
}

/** Native-friendly unavailable feature panel with a deep link action (not a dead-end web message). */
export function UnavailableFeaturePanel({
  gameCode,
  title = 'Continue on another device',
  body = 'This room uses a feature that is not available in the mobile app yet. You can open the same game code elsewhere without losing your spot in the lobby.',
  actionLabel,
}: Props) {
  const code = gameCode.toUpperCase()
  const url = gameWebUrl(gameCode)

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable style={styles.button} onPress={() => void Linking.openURL(url)}>
        <Text style={styles.buttonText}>{actionLabel ?? `Open ${code}`}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    color: '#9ca3af',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
