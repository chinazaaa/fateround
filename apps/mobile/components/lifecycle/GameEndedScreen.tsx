import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  game: Pick<Game, 'title' | 'game_type'> | null
}

export function GameEndedScreen({ game }: Props) {
  const router = useRouter()
  const label = game ? gameLabel(game.game_type) : 'Game'

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🏁</Text>
        <Text style={styles.title}>{game?.title ?? 'This game'}</Text>
        <Text style={styles.badge}>{label}</Text>
        <Text style={styles.heading}>This game has ended</Text>
        <Text style={styles.body}>
          This link is no longer active. Join a new game with a code from the home screen.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Go home</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#17171d',
    borderRadius: 16,
    padding: 24,
    gap: 10,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  badge: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  body: {
    color: '#9ca3af',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
