import { Share, StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native'
import { gameWebUrl } from '@/lib/config'

type Props = {
  gameCode: string
  title?: string
}

export function ShareGameCard({ gameCode, title = 'Invite friends' }: Props) {
  const url = gameWebUrl(gameCode)

  const onShare = async () => {
    try {
      await Share.share({
        message: `Join my game on Fate Round — code ${gameCode.toUpperCase()}\n${url}`,
      })
    } catch {
      // dismissed
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.code}>{gameCode.toUpperCase()}</Text>
      <Text style={styles.url} numberOfLines={1}>
        {url}
      </Text>
      <Pressable style={styles.button} onPress={() => void onShare()}>
        <Text style={styles.buttonText}>Share game link</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    gap: 8,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  code: { color: '#fda4af', fontSize: 28, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  url: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
})
