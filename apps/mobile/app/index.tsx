import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { normalizeGameCode } from '@fateround/shared'
import { getRecentGames, type RecentGame } from '@/lib/recent-games'
import { WEB_BASE_URL } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'

export default function HomeScreen() {
  const router = useRouter()
  const [gameCode, setGameCode] = useState('')
  const [recent, setRecent] = useState<RecentGame[]>([])

  useEffect(() => {
    void getRecentGames().then(setRecent)
  }, [])

  const onJoin = () => {
    const code = normalizeGameCode(gameCode)
    if (code.length < 4) return
    router.push(`/game/${code}`)
  }

  const openCreateOnWeb = () => {
    void Linking.openURL(`${WEB_BASE_URL}/create`)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardFormScreen contentContainerStyle={styles.container}>
        <Text style={styles.brand}>Fate Round</Text>
        <Text style={styles.subtitle}>Join a party game with a code — no sign-in required.</Text>

        <TextInput
          style={styles.input}
          placeholder="Game code"
          placeholderTextColor="#6b7280"
          value={gameCode}
          onChangeText={(value) => setGameCode(value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
        />

        <Pressable
          style={[styles.button, gameCode.trim().length < 4 && styles.buttonDisabled]}
          onPress={onJoin}
          disabled={gameCode.trim().length < 4}
        >
          <Text style={styles.buttonText}>Join game</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={() => router.push('/create')}>
          <Text style={styles.buttonText}>Create a game</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={openCreateOnWeb}>
          <Text style={styles.secondaryButtonText}>More setup options</Text>
        </Pressable>

        {recent.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recent games</Text>
            {recent.map((entry) => (
              <Pressable key={entry.code} style={styles.recentRow} onPress={() => router.push(`/game/${entry.code}`)}>
                <View style={styles.recentMeta}>
                  <Text style={styles.recentCode}>{entry.code}</Text>
                  <Text style={styles.recentLabel}>
                    {entry.title || (entry.gameType ? gameLabel(entry.gameType as never) : 'Game')}
                  </Text>
                </View>
                <Text style={styles.recentChevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.footerHint}>Host link opens automatically when you create and return to the app.</Text>
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: {
    padding: 24,
    gap: 12,
    paddingBottom: 40,
  },
  brand: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 24,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#d1d5db',
    fontSize: 15,
    fontWeight: '600',
  },
  recentSection: { marginTop: 16, gap: 8 },
  recentTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17171d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  recentMeta: { flex: 1 },
  recentCode: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  recentLabel: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  recentChevron: { color: '#6b7280', fontSize: 22 },
  footerHint: { color: '#6b7280', fontSize: 12, lineHeight: 18, marginTop: 8 },
})
